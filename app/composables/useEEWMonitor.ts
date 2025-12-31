export const useEEWMonitor = () => {
	// 상태 변수
	const eewData = ref<any>(null);
	const currentDisplayTime = ref<string>("");
	const connectionStatus = ref<"init" | "syncing" | "live" | "error">("init");
	const lastErrorMessage = ref<string | null>(null);

	// [NEW] 마지막 지진 식별을 위한 변수
	const lastEventId = ref<string | null>(null);

	// [NEW] Nuxt UI Toast 사용
	const toast = useToast();

	// 포인트 데이터 상태
	const stationPointsData = ref<any>(null);

	// [변경] timerId 대신 worker 변수 사용
	// let timerId: any = null; (삭제 또는 주석)
	let worker: Worker | null = null;
	let simulatedTime: Date | null = null;
	let isFetching = false;

	// [NEW] 알림 권한 상태 저장 (기본값: 지원하지 않거나 아직 모름)
	const notificationPermission = ref<NotificationPermission>("default");

	// [NEW] 권한 상태 확인 함수
	const checkNotificationPermission = () => {
		if (typeof Notification !== "undefined") {
			notificationPermission.value = Notification.permission;
		}
	};

	// [NEW] 알림 발송 함수
	const sendNotification = (eew: any) => {
		const title = `[지진 속보] ${eew.region_name} 규모 ${eew.magunitude}`;
		const body = `깊이 ${eew.depth}, 최대 진도 ${eew.calcintensity}`;

		// 1. Nuxt UI Toast (앱 내부 알림)
		toast.add({
			title: "지진 속보 수신",
			description: title,
			icon: "i-heroicons-exclamation-triangle",
			color: "neutral",
		});

		// 2. 브라우저 알림 (앱이 백그라운드일 때 유용)
		if (
			typeof Notification !== "undefined" &&
			Notification.permission === "granted"
		) {
			// 모바일에서는 서비스 워커가 필요할 수 있으나, 데스크탑/안드로이드 일부 환경에서는 바로 작동
			new Notification("지진 조기 경보 (EEW)", {
				body: `${title}\n${body}`,
				icon: "/icon-192x192.png", // public 폴더의 아이콘 경로
				tag: eew.report_id || eew.origin_time, // 태그가 같으면 알림이 쌓이지 않고 갱신됨
				requireInteraction: true, // 사용자가 닫을 때까지 유지
			});
		}
	};

	const requestNotificationPermission = async () => {
		if (typeof Notification !== "undefined") {
			const permission = await Notification.requestPermission();
			notificationPermission.value = permission; // [NEW] 상태 업데이트

			if (permission === "granted") {
				toast.add({ title: "알림이 활성화되었습니다." });
			}
		}
	};

	// [헬퍼] request_time 문자열(YYYYMMDDHHmmss)을 Date 객체로 변환
	const parseRequestTime = (timeStr: string): Date | null => {
		if (!timeStr || timeStr.length !== 14) return null;

		const year = parseInt(timeStr.substring(0, 4));
		const month = parseInt(timeStr.substring(4, 6)) - 1;
		const day = parseInt(timeStr.substring(6, 8));
		const hour = parseInt(timeStr.substring(8, 10));
		const min = parseInt(timeStr.substring(10, 12));
		const sec = parseInt(timeStr.substring(12, 14));

		return new Date(year, month, day, hour, min, sec);
	};

	// [로직 1] 서버 시간 동기화
	const syncFromServer = async (): Promise<boolean> => {
		try {
			const latestRes = await fetch("/api/latest").then((r) => r.json());
			const newTime = new Date(latestRes.latest_time);

			simulatedTime = newTime;
			currentDisplayTime.value = formatDateToDisplay(newTime);
			lastErrorMessage.value = null;

			console.log("Synced time to:", newTime);
			return true;
		} catch (error: any) {
			console.error("Failed to sync latest time:", error);
			connectionStatus.value = "error";
			lastErrorMessage.value = "Sync Failed";
			return false;
		}
	};

	// [로직 2] 루프 실행
	const startLoop = () => {
		// 이미 워커가 있다면 정리
		if (worker) {
			worker.terminate();
		}

		// [변경] Vite의 import.meta.url 기능을 사용하여 TS 워커를 로드
        // Nuxt/Vite가 이 코드를 보고 .ts를 .js로 컴파일하여 번들링해줍니다.
        worker = new Worker(
            new URL('~/assets/timer-worker.ts', import.meta.url), 
            { type: 'module' } // TS 워커는 모듈 타입으로 로드해야 함
        );

		// 워커로부터 메시지(tick)를 받을 때마다 실행되는 함수
		worker.onmessage = async () => {
			// ----- 기존 setInterval 내부 로직을 여기에 그대로 넣습니다 -----
			if (!simulatedTime) return;

			// 내부 시간 증가
			simulatedTime.setSeconds(simulatedTime.getSeconds() + 1);

			// 중복 요청 방지
			if (isFetching) {
				console.warn(
					"Skipping request: Previous request is still pending."
				);
				return;
			}

			isFetching = true;
			const timeParam = formatDateToParam(simulatedTime);

			try {
				const response = await fetch(
					`/api/eew?time=${timeParam}&type=acmap&source=s`
				).then((r) => {
					if (!r.ok) throw new Error(`API Error: ${r.status}`);
					return r.json();
				});

				// [변경] 응답받은 timestamp를 사용하여 화면 시간 업데이트
				// eew 데이터 유무와 상관없이 서버가 해당 시간을 처리했으므로 시간을 갱신함
				if (response.timestamp) {
					const responseDate = parseRequestTime(response.timestamp);
					if (responseDate) {
						currentDisplayTime.value =
							formatDateToDisplay(responseDate);
					}
				}

				// 1. EEW 데이터 처리
				if (response.eew) {
					const incomingEEW = response.eew;

					// [NEW] 새로운 지진인지 판별 (Event ID 또는 발생 시간 활용)
					// API 응답에 event_id나 report_id가 있다면 그것을 사용.
					// 없다면 origin_time을 식별자로 사용.
					const currentId =
						incomingEEW.report_id || incomingEEW.origin_time;

					// 데이터가 유효하고(취소가 아니고), 이전에 받은 ID와 다를 때
					if (
						currentId &&
						lastEventId.value !== currentId &&
						incomingEEW.is_cancel !== true
					) {
						lastEventId.value = currentId; // ID 갱신
						sendNotification(incomingEEW); // 알림 발송

						// (옵션) 효과음 재생을 원하면 여기서 playSound() 호출
					}

					eewData.value = incomingEEW;
					connectionStatus.value = "live";
					lastErrorMessage.value = null;
				} else {
					connectionStatus.value = "live";
					// eew 데이터가 사라지면(상황 종료), ID를 초기화할지 결정
					// lastEventId.value = null; // 필요시 주석 해제
				}

				// 2. 관측소 데이터 처리
				if (response.points) {
					stationPointsData.value = response.points;
				} else {
					stationPointsData.value = {
						type: "FeatureCollection",
						features: [],
					};
				}
			} catch (err: any) {
				console.error("Fetch Loop Error", err);
				connectionStatus.value = "error";
				lastErrorMessage.value = "Connection Lost";

				stationPointsData.value = {
					type: "FeatureCollection",
					features: [],
				};
			} finally {
				isFetching = false;
			}
		};
		// 워커 시작 신호 전송
		worker.postMessage("start");
	};
	// [로직 3] 중단 및 정리
    const stopEEW = () => {
        if (worker) {
            worker.postMessage("stop"); // 워커 타이머 중지
            worker.terminate(); // 워커 프로세스 종료
            worker = null;
        }
        isFetching = false;
    };

    // [변경] 수동 동기화 핸들러
    const handleManualSync = async () => {
        if (connectionStatus.value === "syncing") return;
        stopEEW(); // 기존 타이머/워커 정리
        
        isFetching = false;
        connectionStatus.value = "syncing";
        const success = await syncFromServer();
        if (success) {
            startLoop();
        }
    };

	const initEEW = async () => {
		connectionStatus.value = "syncing";
		isFetching = false;
		const success = await syncFromServer();
		if (success) {
			startLoop();
		}
	};

	// 마운트 시 현재 권한 상태 확인
	onMounted(() => {
		checkNotificationPermission();
	});

	// 컴포넌트 언마운트 시 워커 정리 (안전장치)
    onBeforeUnmount(() => {
        stopEEW();
    });

	return {
		eewData,
		stationPointsData,
		currentDisplayTime,
		connectionStatus,
		lastErrorMessage,
		handleManualSync,
		initEEW,
		stopEEW,
		requestNotificationPermission,
		notificationPermission,
	};
};
