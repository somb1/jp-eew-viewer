let timerId = null;

self.onmessage = function (e) {
	if (e.data === "start") {
		if (timerId) clearInterval(timerId);
		// 1초마다 메인 스레드에 신호를 보냄
		timerId = setInterval(() => {
			self.postMessage("tick");
		}, 1000);
	} else if (e.data === "stop") {
		if (timerId) clearInterval(timerId);
		timerId = null;
	}
};
