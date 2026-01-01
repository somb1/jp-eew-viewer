// [헬퍼] request_time 문자열(YYYYMMDDHHmmss)을 Date 객체로 변환
export default function (timeStr: string): Date | null {
	if (!timeStr || timeStr.length !== 14) return null;

	const year = parseInt(timeStr.substring(0, 4));
	const month = parseInt(timeStr.substring(4, 6)) - 1;
	const day = parseInt(timeStr.substring(6, 8));
	const hour = parseInt(timeStr.substring(8, 10));
	const min = parseInt(timeStr.substring(10, 12));
	const sec = parseInt(timeStr.substring(12, 14));

	return new Date(year, month, day, hour, min, sec);
}
