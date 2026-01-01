import { useStorage } from "@vueuse/core";

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

	// [NEW] 진행 중인 fetch 요청을 취소하기 위한 컨트롤러 저장소
    let currentSyncController: AbortController | null = null;

	// [설정] 허용 가능한 최대 시간 오차 (ms) - 3초 이상 차이나면 재동기화
    const MAX_TIME_DRIFT = 3000;

	let simulatedTime: Date | null = null;
	let isFetching = false;

	// [NEW] 모니터링 설정 상태 (기본값 설정)
    const monitorType = ref<string>("acmap"); // 기본값: 최대 가속도
    const monitorSource = ref<string>("s");   // 기본값: 지표

	// [NEW] 앱 내부 알림 스위치 (로컬 스토리지에 저장하여 설정 유지)
    // 브라우저 권한이 있어도 이 값이 false면 알림을 안 보냄
    const isNotificationActive = useStorage<boolean>("eew-notification-active", false);

    // [NEW] 알림 권한 상태 저장
    const notificationPermission = ref<NotificationPermission>("default");
	
	// [NEW] 권한 상태 확인 함수
	const checkNotificationPermission = () => {
		if (typeof Notification !== "undefined") {
			notificationPermission.value = Notification.permission;
		}
	};

    // [수정] 권한 상태 확인 함수 (외부 노출용 아님, 내부 사용)
    const updatePermissionState = () => {
        if (typeof Notification !== "undefined") {
            notificationPermission.value = Notification.permission;
        }
    };

    // [수정] 알림 토글 함수 (핵심 로직 변경)
    const toggleNotification = async () => {
        // 0. 브라우저 지원 여부 확인
        if (typeof Notification === "undefined") {
            toast.add({ title: "이 기기는 알림을 지원하지 않습니다.", icon: "i-heroicons-x-circle" });
            return;
        }

        // [핵심] ref 값이 아닌 '현재' 브라우저의 실제 권한 상태를 즉시 읽어옴
        // iOS는 이 값이 실시간으로 변동될 수 있으므로 클릭 시점에 다시 읽어야 함
        const currentPerm = Notification.permission;
        notificationPermission.value = currentPerm; // 상태 동기화

        // 1. 권한이 없는 경우 (default) -> 권한 요청
        if (currentPerm === 'default') {
            try {
                // [중요] iOS에서는 이 함수가 사용자 제스처(클릭) 스택에서 즉시 실행되어야 함
                const permission = await Notification.requestPermission();
                notificationPermission.value = permission;

                if (permission === 'granted') {
                    isNotificationActive.value = true;
                    toast.add({ title: "알림이 활성화되었습니다.", icon: "i-heroicons-bell" });
                } else {
                    // 사용자가 '허용 안함'을 눌렀거나 무시한 경우
                    toast.add({ title: "알림 권한이 거부되었습니다.", icon: "i-heroicons-bell-slash" });
                    isNotificationActive.value = false;
                }
            } catch (err) {
                console.error("Notification permission error:", err);
                toast.add({ title: "권한 요청 중 오류가 발생했습니다." });
            }
            return;
        }

        // 2. 권한이 이미 거부된 경우 (denied)
        if (currentPerm === 'denied') {
            toast.add({
                title: "알림 권한이 차단되었습니다.",
                description: "브라우저 또는 기기 설정에서 알림 권한을 허용해주세요.",
                icon: "i-heroicons-exclamation-circle",
            });
            isNotificationActive.value = false;
            return;
        }

        // 3. 권한이 이미 있는 경우 (granted) -> 스위치 토글
        isNotificationActive.value = !isNotificationActive.value;

        toast.add({
            title: isNotificationActive.value ? "알림을 켰습니다." : "알림을 껐습니다.",
            icon: isNotificationActive.value ? "i-heroicons-bell" : "i-heroicons-bell-slash",
            color: "neutral"
        });
    };

	// [MODIFIED] 알림 발송 함수 수정
    const sendNotification = (eew: any) => {
        // [CHECK] 앱 내부 스위치가 꺼져있으면 발송 중단
        if (!isNotificationActive.value) return;

        const title = `[지진 속보] ${eew.region_name} 규모 ${eew.magunitude}`;
        const body = `깊이 ${eew.depth}, 최대 진도 ${eew.calcintensity}`;

        // 1. Nuxt UI Toast
        toast.add({
            title: "지진 속보 수신",
            description: title,
            icon: "i-heroicons-exclamation-triangle",
            color: "neutral",
        });

        // 2. 브라우저 알림
        if (
            typeof Notification !== "undefined" &&
            Notification.permission === "granted"
        ) {
            new Notification("지진 조기 경보 (EEW)", {
                body: `${title}\n${body}`,
                icon: "/icon-192x192.png",
                tag: eew.report_id || eew.origin_time,
                requireInteraction: true,
            });
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

	// [수정된 syncFromServer]
    // 외부에서 취소 신호(AbortSignal)를 받지 않고, 내부에서 컨트롤러를 관리합니다.
    const syncFromServer = async (): Promise<boolean> => {
        // 1. 기존에 진행 중이던 요청이 있다면 취소 (이게 핵심)
        if (currentSyncController) {
            currentSyncController.abort();
        }
        
        // 2. 새로운 컨트롤러 생성
        currentSyncController = new AbortController();
        const signal = currentSyncController.signal;

        // 3. 5초 타임아웃 타이머 설정
        const timeoutId = setTimeout(() => {
            if (currentSyncController) currentSyncController.abort("TIMEOUT");
        }, 5000);

        try {
            console.log("Fetching latest time...");
            const latestRes = await fetch("/api/latest", { signal }).then((r) => r.json());

            clearTimeout(timeoutId); // 성공 시 타이머 해제
            currentSyncController = null; // 요청 완료됨

            const newTime = new Date(latestRes.latest_time);
            simulatedTime = newTime;
            currentDisplayTime.value = formatDateToDisplay(newTime);
            lastErrorMessage.value = null;

            console.log("Synced time to:", newTime);
            return true;
        } catch (error: any) {
            clearTimeout(timeoutId);
            currentSyncController = null;

            // 이미 취소된 요청(새로운 요청에 의해)이라면 에러 처리 하지 않음
            if (error.name === 'AbortError' && signal.aborted && signal.reason !== "TIMEOUT") {
                console.log("Previous sync aborted for new request.");
                return false; 
            }

            console.error("Sync Failed:", error);
            
            if (signal.reason === "TIMEOUT") {
                lastErrorMessage.value = "Network Timeout";
            } else {
                lastErrorMessage.value = "Sync Failed";
            }
            
            connectionStatus.value = "error";
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

            // [1] responseDate 변수 스코프를 상위로 올려서 eew 처리 로직에서도 쓸 수 있게 함
            let responseDate: Date | null = null;

			// [핵심 1] 워커가 보낸 신호를 처리할 때마다 '시간 검증' 수행
            // 이유: iOS에서 백그라운드 후 복귀 시, 워커가 밀린 틱을 한꺼번에 보내거나
            // 멈췄던 시점부터 다시 시작할 수 있음. 이때 실제 시간과 비교해야 함.
            const now = new Date();
            const drift = now.getTime() - simulatedTime.getTime();

            // 시간이 3초 이상 틀어졌다면
            if (Math.abs(drift) > MAX_TIME_DRIFT) {
                console.warn(`[Drift] ${drift}ms. Forcing Sync.`);
                // [중요] force=true로 호출하여 기존 'syncing' 상태를 무시하고 새로고침
                handleManualSync(true); 
                return;
            }

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
                // [MODIFIED] 동적 파라미터 적용 (monitorType.value, monitorSource.value 사용)
                // 반응형 변수의 현재 값을 읽어와 URL 생성
                const url = `/api/eew?time=${timeParam}&type=${monitorType.value}&source=${monitorSource.value}`;
                
                const response = await fetch(url).then((r) => {
                    if (!r.ok) throw new Error(`API Error: ${r.status}`);
                    return r.json();
                });

				// [변경] 응답받은 timestamp 처리
                if (response.timestamp) {
                    responseDate = parseRequestTime(response.timestamp);
                    if (responseDate) {
                        currentDisplayTime.value = formatDateToDisplay(responseDate);
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
                    
                    // --- [NEW] 시간 차이 계산 로직 추가 ---
                    let isRecentEvent = false;
                    
                    // 지진 발생 시간 파싱
                    const originDate = parseRequestTime(incomingEEW.origin_time);

                    if (responseDate && originDate) {
                        // 서버 시간 - 발생 시간 (밀리초 단위)
                        const diffMs = responseDate.getTime() - originDate.getTime();
                        
                        // 차이가 5초(5000ms) 이내이고, 미래 시간이 아닐 때 (혹은 약간의 오차 허용)
                        // 0보다 작으면(미래) 데이터 오류일 수 있으나, 일단 5초 이내 차이만 확인
                        if (diffMs >= 0 && diffMs <= 60000) {
                            isRecentEvent = true;
                        }
                    }
                    // ------------------------------------

                    // 데이터가 유효하고, ID가 다르고, 취소가 아니며, 
                    // [NEW] "최근 5초 이내 발생한 건"일 경우에만 알림 발송
                    if (
                        currentId &&
                        lastEventId.value !== currentId &&
                        incomingEEW.is_cancel !== true &&
                        isRecentEvent // <--- 여기에 조건 추가
                    ) {
                        lastEventId.value = currentId; // ID 갱신
                        sendNotification(incomingEEW); // 알림 발송
                    } 
                    // [추가] 만약 5초가 지났지만 새로운 ID라면? (알림은 안 보내고 데이터만 갱신할지 결정)
                    // 현재 로직상으로는 알림 조건에만 isRecentEvent를 넣었으므로,
                    // 알림은 안 가지만 아래 eewData.value 갱신은 정상적으로 이루어집니다.
                    else if (
                         currentId &&
                         lastEventId.value !== currentId
                    ) {
                         // 알림은 스킵하지만 중복 방지를 위해 ID는 업데이트 해주는 것이 좋습니다.
                         // 그렇지 않으면 나중에 시간이 맞아도 ID가 null이라 꼬일 수 있음
                         lastEventId.value = currentId;
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

    // [수정된 handleManualSync]
    // force 파라미터 추가: true일 경우 'syncing' 상태여도 강제로 다시 실행
    const handleManualSync = async (force: boolean = false) => {
        // 강제가 아니고 이미 싱크 중이면 스킵
        if (!force && connectionStatus.value === "syncing") {
            return;
        }

        console.log(`Manual Sync triggered (Force: ${force})`);

        stopEEW(); // 기존 루프/워커 정지
        isFetching = false;
        
        // 상태를 강제로 syncing으로 설정 (화면 갱신)
        connectionStatus.value = "syncing"; 
        
        // 약간의 딜레이를 주어 UI가 반응할 시간을 줌 (선택사항)
        // await new Promise(r => setTimeout(r, 50));

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

	const visibility = useDocumentVisibility();

	const onPageShow = (event: PageTransitionEvent) => {
        // persisted가 true면 캐시에서 복원된 것임 (iOS 자주 발생)
        if (event.persisted || document.visibilityState === 'visible') {
            checkAndSync();
        }
    };

    const checkAndSync = () => {
        if (!simulatedTime) {
            handleManualSync();
            return;
        }
        const now = new Date();
        const diff = now.getTime() - simulatedTime.getTime();
        
        if (Math.abs(diff) > MAX_TIME_DRIFT) {
            console.log(`[App Resumed] Significant drift (${diff}ms). Resyncing.`);
            handleManualSync();
        }
    };

	// 마운트 시 현재 권한 상태 확인
	onMounted(() => {
		checkNotificationPermission();
		window.addEventListener('pageshow', onPageShow);
	});

	// 컴포넌트 언마운트 시 워커 정리 (안전장치)
    onBeforeUnmount(() => {
        stopEEW();
		window.removeEventListener('pageshow', onPageShow);
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
		toggleNotification, // [NEW] export
        isNotificationActive, // [NEW] export
		notificationPermission,
		visibility,
		monitorType,   // [NEW] export
        monitorSource, // [NEW] export
	};
};
