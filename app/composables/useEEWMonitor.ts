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

			// 1초 증가
			simulatedTime.setSeconds(simulatedTime.getSeconds() + 1);

			// UI 업데이트
			const timeParam = formatDateToParam(simulatedTime);
			currentDisplayTime.value = formatDateToDisplay(simulatedTime);

			try {
				// ====================================================
				// [수정] 통합된 API 요청 (EEW + Points)
				// 타입/소스는 기본값(acmap/s)을 쓰거나 필요시 쿼리스트링에 추가
				// ====================================================
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
				} else {
					// EEW 데이터가 null이면 연결 문제일 가능성 높음
					// 하지만 404가 아니라 내부 파싱 에러 등으로 null일 수 있으므로 상황에 따라 처리
					// 여기서는 기존 값 유지 또는 경고
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

				// 에러 시 포인트 데이터 비우기 (선택 사항)
				// stationPointsData.value = { type: "FeatureCollection", features: [] };
			}
		}, 1000);
	};

	// [로직 3] 수동/초기화 핸들러
	const handleManualSync = async () => {
		if (connectionStatus.value === "syncing") return;

		if (timerId) clearInterval(timerId);
		connectionStatus.value = "syncing";

		const success = await syncFromServer();
		if (success) {
			startLoop();
		}
	};

	const initEEW = async () => {
		connectionStatus.value = "syncing";
		const success = await syncFromServer();
		if (success) {
			startLoop();
		}
	};

	const stopEEW = () => {
		if (timerId) clearInterval(timerId);
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
