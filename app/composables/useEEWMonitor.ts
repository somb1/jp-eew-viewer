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
	let isFetching = false;

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
		if (timerId) clearInterval(timerId);

		timerId = setInterval(async () => {
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
					eewData.value = response.eew;
					connectionStatus.value = "live";
					lastErrorMessage.value = null;
				} else {
					// eew가 없어도 연결 상태는 정상이므로 live 유지
					connectionStatus.value = "live";
					// eewData.value = null; // 필요하다면 초기화 (보통은 이전 데이터를 유지하거나 null 처리)
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
		}, 1000);
	};

	// [로직 3] 수동/초기화 핸들러 (기존과 동일)
	const handleManualSync = async () => {
		if (connectionStatus.value === "syncing") return;
		if (timerId) clearInterval(timerId);
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
