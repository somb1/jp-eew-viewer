import { ref } from "vue";
// import ... (필요한 import 유지)

export const useEEWMonitor = () => {
	// 상태 변수
	const eewData = ref<any>(null);
	const currentDisplayTime = ref<string>("");
	const connectionStatus = ref<"init" | "syncing" | "live" | "error">("init");
	const lastErrorMessage = ref<string | null>(null);

	// 포인트 데이터 상태
	const stationPointsData = ref<any>(null);

	// 내부 변수
	let timerId: any = null;
	let simulatedTime: Date | null = null;

	// [추가] 중복 요청 방지용 플래그
	let isFetching = false;

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
		if (timerId) clearInterval(timerId);

		timerId = setInterval(async () => {
			if (!simulatedTime) return;

			// 1. 내부 시간은 네트워크 상태와 무관하게 1초씩 계속 흘러가야 합니다.
			simulatedTime.setSeconds(simulatedTime.getSeconds() + 1);

			// [핵심] 이미 데이터를 가져오는 중이라면 이번 틱(Tick)은 건너뜁니다.
			if (isFetching) {
				console.warn(
					"Skipping request: Previous request is still pending."
				);
				return;
			}

			// 2. 요청 시작 전 플래그 잠금
			isFetching = true;

			const timeParam = formatDateToParam(simulatedTime);

			try {
				const response = await fetch(
					`/api/eew?time=${timeParam}&type=acmap&source=s`
				).then((r) => {
					if (!r.ok) throw new Error(`API Error: ${r.status}`);
					return r.json();
				});

				// 1. EEW 데이터 처리
				if (response.eew) {
					eewData.value = response.eew;
					connectionStatus.value = "live";
					lastErrorMessage.value = null;

					const reqTimeStr = response.eew.request_time;
					const reqDate = parseRequestTime(reqTimeStr);

					if (reqDate) {
						currentDisplayTime.value = formatDateToDisplay(reqDate);
					}
				} else {
					console.warn("EEW data is empty");
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
				// [핵심] 성공하든 실패하든 요청이 끝나면 플래그 해제
				isFetching = false;
			}
		}, 1000);
	};

	// [로직 3] 수동/초기화 핸들러
	const handleManualSync = async () => {
		if (connectionStatus.value === "syncing") return;

		if (timerId) clearInterval(timerId);
		// 수동 동기화 시에는 fetching 상태 초기화
		isFetching = false;
		connectionStatus.value = "syncing";

		const success = await syncFromServer();
		if (success) {
			startLoop();
		}
	};

	const initEEW = async () => {
		connectionStatus.value = "syncing";
		isFetching = false; // 초기화 시 플래그 리셋
		const success = await syncFromServer();
		if (success) {
			startLoop();
		}
	};

	const stopEEW = () => {
		if (timerId) clearInterval(timerId);
		isFetching = false;
	};

	return {
		eewData,
		stationPointsData,
		currentDisplayTime,
		connectionStatus,
		lastErrorMessage,
		handleManualSync,
		initEEW,
		stopEEW,
	};
};
