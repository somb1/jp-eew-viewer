import { useStorage, useDocumentVisibility } from "@vueuse/core";

export const useEEWMonitor = () => {
	// =========================================================================================
	// 1. 상수 및 설정값
	// =========================================================================================

	// 허용 가능한 최대 시간 오차 (ms)
	// 클라이언트 시뮬레이션 시간과 실제 시간 차이가 이 값을 초과하면 재동기화 수행
	const MAX_TIME_DRIFT = 3000;

	// [추가] 클라이언트와 서버 시간의 초기 오차를 저장할 변수
    let initialTimeOffset: number | null = null;

	// =========================================================================================
	// 2. 상태 변수 (Reactive State)
	// =========================================================================================

	// [추가] 리플레이 오프셋 (분 단위, 0 = 실시간)
    const replayOffsetMinutes = ref(0);

	// [추가] 리플레이 모드인지 판별하는 Computed
    const isReplayMode = computed(() => replayOffsetMinutes.value > 0);

	// [데이터 상태]
	const eewData = ref<any>(null); // 현재 수신된 EEW 데이터
	const stationPointsData = ref<any>(null); // 관측소(PGA/PGV 등) 지점 데이터
	const lastEventId = ref<string | null>(null); // 중복 알림 방지를 위한 마지막 이벤트 ID

	// [UI 상태]
	const currentDisplayTime = ref<string>(""); // 화면에 표시되는 현재 시각 (포맷팅됨)
	const connectionStatus = ref<"init" | "syncing" | "live" | "error">("init"); // 연결 상태
	const lastErrorMessage = ref<string | null>(null); // 에러 메시지

	// [설정 상태]
	const monitorType = ref<string>("acmap"); // 시각화 타입 (기본값: 최대 가속도)
	const monitorSource = ref<string>("s"); // 데이터 소스 (기본값: 지표)

	// [알림 설정 상태]
	// 브라우저 권한과 별개로 앱 내부에서의 알림 활성화 여부 (로컬 스토리지 저장)
	const isNotificationActive = useStorage<boolean>(
		"eew-notification-active",
		false
	);
	const notificationPermission = ref<NotificationPermission>("default");

	// =========================================================================================
	// 3. 내부 변수 (Non-reactive Logic Vars)
	// =========================================================================================

	// Nuxt UI Toast 인스턴스
	const toast = useToast();

	// 타이머 워커 및 네트워크 컨트롤러
	let worker: Worker | null = null;
	let currentSyncController: AbortController | null = null;

	// 시뮬레이션용 내부 시간 객체
	let simulatedTime: Date | null = null;
	let isFetching = false;

	// =========================================================================================
	// 4. 유틸리티 및 헬퍼 함수
	// =========================================================================================

	/**
	 * request_time 문자열(YYYYMMDDHHmmss)을 Date 객체로 변환
	 */
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

	/**
	 * 현재 브라우저의 알림 권한 상태 확인
	 */
	const checkNotificationPermission = () => {
		if (typeof Notification !== "undefined") {
			notificationPermission.value = Notification.permission;
		}
	};

	// =========================================================================================
	// 5. 알림 로직 (Notifications)
	// =========================================================================================

	/**
	 * 알림 토글 (권한 요청 -> 설정 변경)
	 * - iOS 대응: 사용자 클릭 이벤트 내에서 즉시 권한을 요청해야 함
	 */
	const toggleNotification = async () => {
		if (typeof Notification === "undefined") {
			toast.add({
				title: "이 기기는 알림을 지원하지 않습니다.",
				icon: "i-heroicons-x-circle",
			});
			return;
		}

		// 현재 시점의 실제 권한 상태 조회
		const currentPerm = Notification.permission;
		notificationPermission.value = currentPerm;

		// 1. 권한 없음 (default) -> 요청 시도
		if (currentPerm === "default") {
			try {
				const permission = await Notification.requestPermission();
				notificationPermission.value = permission;

				if (permission === "granted") {
					isNotificationActive.value = true;
					toast.add({
						title: "알림이 활성화되었습니다.",
						icon: "i-heroicons-bell",
					});
				} else {
					toast.add({
						title: "알림 권한이 거부되었습니다.",
						icon: "i-heroicons-bell-slash",
					});
					isNotificationActive.value = false;
				}
			} catch (err) {
				console.error("Notification permission error:", err);
				toast.add({ title: "권한 요청 중 오류가 발생했습니다." });
			}
			return;
		}

		// 2. 권한 거부됨 (denied)
		if (currentPerm === "denied") {
			toast.add({
				title: "알림 권한이 차단되었습니다.",
				description:
					"브라우저 또는 기기 설정에서 알림 권한을 허용해주세요.",
				icon: "i-heroicons-exclamation-circle",
			});
			isNotificationActive.value = false;
			return;
		}

		// 3. 권한 있음 (granted) -> 스위치 토글
		isNotificationActive.value = !isNotificationActive.value;
		toast.add({
			title: isNotificationActive.value
				? "알림을 켰습니다."
				: "알림을 껐습니다.",
			icon: isNotificationActive.value
				? "i-heroicons-bell"
				: "i-heroicons-bell-slash",
			color: "neutral",
		});
	};``

	/**
	 * 실제 알림 발송 처리
	 */
	// sendNotification 함수 수정: 리플레이 중에는 알림 발송 차단
    const sendNotification = (eew: any) => {
        if (isReplayMode.value) return; // [수정] 과거 데이터 조회 중 알림 방지
        if (!isNotificationActive.value) return;

		const title = `[지진 속보] ${eew.region_name} 규모 ${eew.magunitude}`;
		const body = `깊이 ${eew.depth}, 최대 진도 ${eew.calcintensity}`;

		// Toast 알림 (항상 표시)
		toast.add({
			title: "지진 속보 수신",
			description: title,
			icon: "i-heroicons-exclamation-triangle",
			color: "neutral",
		});

		// 브라우저 시스템 알림 (권한이 있을 때만)
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

	// =========================================================================================
	// 6. 서버 시간 동기화 (Time Synchronization)
	// =========================================================================================

	/**
	 * 서버로부터 최신 기준 시간을 받아옴
	 * - 중복 요청 취소(AbortController) 및 타임아웃 처리 포함
	 */
	const syncFromServer = async (): Promise<boolean> => {
		// 이전 요청 취소
		if (currentSyncController) {
			currentSyncController.abort();
		}

		currentSyncController = new AbortController();
		const signal = currentSyncController.signal;

		// 5초 타임아웃 설정
		const timeoutId = setTimeout(() => {
			if (currentSyncController) currentSyncController.abort("TIMEOUT");
		}, 5000);

		try {
			console.log("Fetching latest time...");
			const latestRes = await fetch("/api/latest", { signal }).then((r) =>
				r.json()
			);

			clearTimeout(timeoutId);
			currentSyncController = null;

			const newTime = new Date(latestRes.latest_time);
			simulatedTime = newTime;

			// [수정] 동기화 성공 시점의 "내 PC 시간"과 "서버 시간"의 차이를 기록합니다.
            // 예: 내 시계가 서버보다 1분 빠르면 offset은 약 60000ms가 됨
            initialTimeOffset = Date.now() - newTime.getTime();

			currentDisplayTime.value = formatDateToDisplay(newTime);
			lastErrorMessage.value = null;

			console.log("Synced time to:", newTime);
			return true;
		} catch (error: any) {
			clearTimeout(timeoutId);
			currentSyncController = null;

			// 중복 요청에 의한 취소는 에러로 간주하지 않음
			if (
				error.name === "AbortError" &&
				signal.aborted &&
				signal.reason !== "TIMEOUT"
			) {
				console.log("Previous sync aborted for new request.");
				return false;
			}

			console.error("Sync Failed:", error);
			lastErrorMessage.value =
				signal.reason === "TIMEOUT" ? "Network Timeout" : "Sync Failed";
			connectionStatus.value = "error";
			return false;
		}
	};

	// =========================================================================================
	// 7. 메인 루프 & 데이터 폴링 (Worker Logic)
	// =========================================================================================

	/**
	 * 웹 워커를 이용한 메인 루프 시작
	 * - setInterval 대신 워커를 사용하여 백그라운드 탭에서도 타이머가 멈추지 않게 함
	 */
	const startLoop = () => {
		// 기존 워커 정리
		if (worker) worker.terminate();

		// Vite의 import.meta.url을 활용해 워커 로드
		worker = new Worker(
			new URL("~/assets/timer-worker.ts", import.meta.url),
			{ type: "module" }
		);

		// [워커 틱(Tick) 핸들러] 매 초마다 실행됨
		worker.onmessage = async () => {
			if (!simulatedTime) return;

			// 1. 시간 검증 (Time Drift Check) 수정됨
            const now = new Date();
            
            // 현재의 시간 차이 계산
            const currentOffset = now.getTime() - simulatedTime.getTime();
            
            // [핵심] "초기 오차"와 "현재 오차"가 달라졌는지를 비교해야 합니다.
            // 브라우저가 정상 작동 중이라면 currentOffset은 initialTimeOffset과 거의 비슷해야 합니다.
            const driftChange = Math.abs(currentOffset - initialTimeOffset!);

            if (driftChange > MAX_TIME_DRIFT) {
                console.warn(`[Drift Detect] Change: ${driftChange}ms. Forcing Sync.`);
                handleManualSync(true); // 강제 재동기화
                return;
            }

			// 2. 내부 시간 1초 증가 및 API 파라미터 준비
			simulatedTime.setSeconds(simulatedTime.getSeconds() + 1);

			if (isFetching) {
				console.warn(
					"Skipping request: Previous request is still pending."
				);
				return;
			}

			isFetching = true;

			// [수정] API 요청용 시간 계산 (simulatedTime - replayOffsetMinutes)
            // 실제 시간에서 오프셋만큼 뺀 시간을 계산합니다.
            const targetDate = new Date(simulatedTime.getTime() - replayOffsetMinutes.value * 60 * 1000);
            const timeParam = formatDateToParam(targetDate);

			let responseDate: Date | null = null;

			try {
				// 3. 데이터 요청 (동적 타입/소스 적용)
				const url = `/api/eew?time=${timeParam}&type=${monitorType.value}&source=${monitorSource.value}`;
				const response = await fetch(url).then((r) => {
					if (!r.ok) throw new Error(`API Error: ${r.status}`);
					return r.json();
				});

				// 4. 응답 시간 처리 및 UI 시간 갱신
				if (response.timestamp) {
					responseDate = parseRequestTime(response.timestamp);
					if (responseDate) {
						currentDisplayTime.value =
							formatDateToDisplay(responseDate);
					}
				}

				// 5. EEW(지진 조기 경보) 데이터 처리
				if (response.eew) {
					const incomingEEW = response.eew;
					const currentId =
						incomingEEW.report_id || incomingEEW.origin_time;

					// [신규 지진 판별 로직]
					let isRecentEvent = false;
					const originDate = parseRequestTime(
						incomingEEW.origin_time
					);

					if (responseDate && originDate) {
						const diffMs =
							responseDate.getTime() - originDate.getTime();
						// 0~60초 이내 (네트워크 지연 고려하여 넉넉히)
						if (diffMs >= 0 && diffMs <= 60000) {
							isRecentEvent = true;
						}
					}

					// [알림 발송 조건]
					// (1) ID가 존재하고 (2) 이전에 받은 ID와 다르며 (3) 취소보가 아니고 (4) 최근 발생한 건
					if (
						currentId &&
						lastEventId.value !== currentId &&
						incomingEEW.is_cancel !== true &&
						isRecentEvent
					) {
						lastEventId.value = currentId;
						sendNotification(incomingEEW);
					}
					// 단순 ID 갱신 (알림은 안 보내지만 데이터 정합성을 위해)
					else if (currentId && lastEventId.value !== currentId) {
						lastEventId.value = currentId;
					}

					eewData.value = incomingEEW;
					connectionStatus.value = "live";
					lastErrorMessage.value = null;
				} else {
					// 데이터 없음 (평시)
					connectionStatus.value = "live";
					// lastEventId.value = null; // 필요 시 주석 해제하여 평시 복귀 시 ID 초기화
				}

				// 6. 관측소 포인트 데이터 업데이트
				stationPointsData.value = response.points || {
					type: "FeatureCollection",
					features: [],
				};
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

	/**
	 * 모니터링 중지 및 워커 정리
	 */
	const stopEEW = () => {
		if (worker) {
			worker.postMessage("stop");
			worker.terminate();
			worker = null;
		}
		isFetching = false;
	};

	// =========================================================================================
	// 8. 생명주기 및 제어 (Lifecycle Control)
	// =========================================================================================

	/**
	 * 수동 동기화 트리거
	 * @param force true일 경우 이미 'syncing' 상태여도 강제로 재시작
	 */
	const handleManualSync = async (force: boolean = false) => {
		if (!force && connectionStatus.value === "syncing") return;

		console.log(`Manual Sync triggered (Force: ${force})`);

		stopEEW(); // 기존 루프 중지
		isFetching = false;
		connectionStatus.value = "syncing";

		const success = await syncFromServer();
		if (success) {
			startLoop();
		}
	};

	/**
	 * 초기 실행
	 */
	const initEEW = async () => {
		connectionStatus.value = "syncing";
		isFetching = false;
		const success = await syncFromServer();
		if (success) {
			startLoop();
		}
	};

	// 페이지 가시성(Visibility) 감지 훅
	const visibility = useDocumentVisibility();

	/**
	 * 페이지 복귀(Resume) 시 시간 오차 확인 및 재동기화
	 */
	const checkAndSync = () => {
		if (!simulatedTime) {
			handleManualSync();
			return;
		}
		const now = new Date();
		const diff = now.getTime() - simulatedTime.getTime();

		if (Math.abs(diff) > MAX_TIME_DRIFT) {
			console.log(
				`[App Resumed] Significant drift (${diff}ms). Resyncing.`
			);
			handleManualSync();
		}
	};

	const onPageShow = (event: PageTransitionEvent) => {
		// persisted가 true면 BFCache(뒤로가기 캐시)에서 복원된 것 -> 재동기화 필수
		if (event.persisted || document.visibilityState === "visible") {
			checkAndSync();
		}
	};

	// 마운트 시 실행
	onMounted(() => {
		checkNotificationPermission();
		window.addEventListener("pageshow", onPageShow);
	});

	// 언마운트 시 정리
	onBeforeUnmount(() => {
		stopEEW();
		window.removeEventListener("pageshow", onPageShow);
	});

	return {
		// 상태 (State)
		eewData,
		stationPointsData,
		currentDisplayTime,
		connectionStatus,
		lastErrorMessage,
		monitorType,
		monitorSource,

		// 알림 (Notifications)
		isNotificationActive,
		notificationPermission,
		toggleNotification,

		// 제어 (Control)
		initEEW,
		stopEEW,
		handleManualSync,
		visibility,

		replayOffsetMinutes, // [추가] 외부로 노출
        isReplayMode,         // [추가]
	};
};
