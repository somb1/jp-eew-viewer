import { useStorage, useDocumentVisibility } from "@vueuse/core";
import { ref, computed, onMounted, onBeforeUnmount } from "vue"; // [참고] ref 등 명시적 import 확인

export const useEEWMonitor = () => {
	// =========================================================================================
	// 1. 상수 및 설정값
	// =========================================================================================

	// 허용 가능한 최대 시간 오차 (ms)
	const MAX_TIME_DRIFT = 3000;

	// 클라이언트와 서버 시간의 초기 오차를 저장할 변수
	let initialTimeOffset: number | null = null;

	// =========================================================================================
	// 2. 상태 변수 (Reactive State)
	// =========================================================================================

	// 리플레이 오프셋 (분 단위, 0 = 실시간)
	const replayOffsetMinutes = ref(0);

	// 리플레이 모드인지 판별하는 Computed
	const isReplayMode = computed(() => replayOffsetMinutes.value > 0);

	// [데이터 상태]
	const eewData = ref<any>(null);
	const stationPointsData = ref<any>(null);
	const lastEventId = ref<string | null>(null);

	// [UI 상태]
	const currentDisplayTime = ref<string>("");
	const connectionStatus = ref<"init" | "syncing" | "live" | "error">("init");
	const lastErrorMessage = ref<string | null>(null);

	// [설정 상태]
	const monitorType = ref<string>("acmap");
	const monitorSource = ref<string>("s");

	// [알림 설정 상태]
	const isNotificationActive = useStorage<boolean>(
		"eew-notification-active",
		false
	);
	const notificationPermission = ref<NotificationPermission>("default");

	// =========================================================================================
	// 3. 내부 변수 (Non-reactive Logic Vars)
	// =========================================================================================

	const toast = useToast();
	let worker: Worker | null = null;
	let currentSyncController: AbortController | null = null;
	let simulatedTime: Date | null = null;
	let isFetching = false;

	// =========================================================================================
	// 4. 유틸리티 및 헬퍼 함수
	// =========================================================================================

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

	const checkNotificationPermission = () => {
		if (typeof Notification !== "undefined") {
			notificationPermission.value = Notification.permission;
		}
	};

	// =========================================================================================
	// 5. 알림 로직 (Notifications)
	// =========================================================================================

	const toggleNotification = async () => {
		if (typeof Notification === "undefined") {
			toast.add({
				title: "이 기기는 알림을 지원하지 않습니다.",
				icon: "i-heroicons-x-circle",
			});
			return;
		}

		const currentPerm = Notification.permission;
		notificationPermission.value = currentPerm;

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
	};

	const sendNotification = (eew: any) => {
		if (isReplayMode.value) return;
		if (!isNotificationActive.value) return;

		const title = `[지진 속보] ${eew.region_name} 규모 ${eew.magunitude}`;
		const body = `깊이 ${eew.depth}, 최대 진도 ${eew.calcintensity}`;

		toast.add({
			title: "지진 속보 수신",
			description: title,
			icon: "i-heroicons-exclamation-triangle",
			color: "neutral",
		});

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

	const syncFromServer = async (): Promise<boolean> => {
		if (currentSyncController) {
			currentSyncController.abort();
		}

		currentSyncController = new AbortController();
		const signal = currentSyncController.signal;

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

			initialTimeOffset = Date.now() - newTime.getTime();

			currentDisplayTime.value = formatDateToDisplay(newTime);
			lastErrorMessage.value = null;

			console.log("Synced time to:", newTime);
			return true;
		} catch (error: any) {
			clearTimeout(timeoutId);
			currentSyncController = null;

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

	const startLoop = () => {
		if (worker) worker.terminate();

		worker = new Worker(
			new URL("~/assets/timer-worker.ts", import.meta.url),
			{ type: "module" }
		);

		worker.onmessage = async () => {
			if (!simulatedTime) return;

			const now = new Date();
			const currentOffset = now.getTime() - simulatedTime.getTime();
			const driftChange = Math.abs(currentOffset - initialTimeOffset!);

			if (driftChange > MAX_TIME_DRIFT) {
				console.warn(
					`[Drift Detect] Change: ${driftChange}ms. Forcing Sync.`
				);
				handleManualSync(true);
				return;
			}

			simulatedTime.setSeconds(simulatedTime.getSeconds() + 1);

			if (isFetching) {
				console.warn(
					"Skipping request: Previous request is still pending."
				);
				return;
			}

			isFetching = true;

			const targetDate = new Date(
				simulatedTime.getTime() - replayOffsetMinutes.value * 60 * 1000
			);
			const timeParam = formatDateToParam(targetDate);

			let responseDate: Date | null = null;

			try {
				const url = `/api/eew?time=${timeParam}&type=${monitorType.value}&source=${monitorSource.value}`;
				const response = await fetch(url).then((r) => {
					if (!r.ok) throw new Error(`API Error: ${r.status}`);
					return r.json();
				});

				if (response.timestamp) {
					responseDate = parseRequestTime(response.timestamp);
					if (responseDate) {
						currentDisplayTime.value =
							formatDateToDisplay(responseDate);
					}
				}

				if (response.eew) {
					const incomingEEW = response.eew;
					const currentId =
						incomingEEW.report_id || incomingEEW.origin_time;

					let isRecentEvent = false;
					const originDate = parseRequestTime(
						incomingEEW.origin_time
					);

					if (responseDate && originDate) {
						const diffMs =
							responseDate.getTime() - originDate.getTime();
						if (diffMs >= 0 && diffMs <= 60000) {
							isRecentEvent = true;
						}
					}

					if (
						currentId &&
						lastEventId.value !== currentId &&
						incomingEEW.is_cancel !== true &&
						isRecentEvent
					) {
						lastEventId.value = currentId;
						sendNotification(incomingEEW);
					} else if (
						currentId &&
						lastEventId.value !== currentId
					) {
						lastEventId.value = currentId;
					}

					eewData.value = incomingEEW;
					connectionStatus.value = "live";
					lastErrorMessage.value = null;
				} else {
					connectionStatus.value = "live";
				}

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

		worker.postMessage("start");
	};

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
		// [수정된 로직 시작]
		// 강제 동기화(force)가 아니고, 현재 리플레이 모드(offset > 0)인 경우
		// => 리플레이를 종료하고 실시간(Live) 시점(offset=0)으로 즉시 이동 (서버 fetch 생략)
		if (!force && replayOffsetMinutes.value > 0) {
			console.log("Exit Replay Mode -> Jump to Live Stream (No Sync)");
			replayOffsetMinutes.value = 0;
			// 0으로 설정하면 다음 워커 Tick에서 targetDate 계산 시 offset이 빠지므로
			// 즉시 현재 시뮬레이션 시간(Live)을 보여주게 됩니다.
			return;
		}
		// [수정된 로직 끝]

		if (!force && connectionStatus.value === "syncing") return;

		console.log(`Manual Sync triggered (Force: ${force})`);

		stopEEW();
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

	const visibility = useDocumentVisibility();

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
		if (event.persisted || document.visibilityState === "visible") {
			checkAndSync();
		}
	};

	onMounted(() => {
		checkNotificationPermission();
		window.addEventListener("pageshow", onPageShow);
	});

	onBeforeUnmount(() => {
		stopEEW();
		window.removeEventListener("pageshow", onPageShow);
	});

	return {
		eewData,
		stationPointsData,
		currentDisplayTime,
		connectionStatus,
		lastErrorMessage,
		monitorType,
		monitorSource,
		isNotificationActive,
		notificationPermission,
		toggleNotification,
		initEEW,
		stopEEW,
		handleManualSync,
		visibility,
		replayOffsetMinutes,
		isReplayMode,
	};
};