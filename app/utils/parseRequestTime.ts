/**
 * API 시간 문자열 파서
 * - "YYYYMMDDHHmmss" 형식의 14자리 문자열을 JavaScript Date 객체로 변환합니다.
 * - 주로 K-moni 등에서 수신한 타임스탬프를 내부 로직에서 사용할 때 쓰입니다.
 *
 * @param timeStr "YYYYMMDDHHmmss" 형식의 문자열 (예: "20250101123000")
 * @returns 변환된 Date 객체, 또는 유효하지 않은 입력일 경우 null
 */
export default function parseRequestTime(timeStr: string): Date | null {
	// =========================================================================================
	// 1. 유효성 검사 (Validation)
	// =========================================================================================
	// 입력값이 없거나 길이가 14자리가 아니라면 날짜로 변환할 수 없음
	if (!timeStr || timeStr.length !== 14) {
		return null;
	}

	// =========================================================================================
	// 2. 문자열 파싱 (Parsing)
	// =========================================================================================
	// substring(start, end)을 이용해 연, 월, 일, 시, 분, 초 단위로 잘라냄

	const year = parseInt(timeStr.substring(0, 4));

	// [중요] JavaScript Date 객체의 월(Month)은 0부터 시작합니다. (0 = 1월, 11 = 12월)
	// 따라서 문자열에서 추출한 숫자에서 반드시 1을 빼주어야 합니다.
	const month = parseInt(timeStr.substring(4, 6)) - 1;

	const day = parseInt(timeStr.substring(6, 8));
	const hour = parseInt(timeStr.substring(8, 10));
	const min = parseInt(timeStr.substring(10, 12));
	const sec = parseInt(timeStr.substring(12, 14));

	// =========================================================================================
	// 3. Date 객체 생성 및 반환
	// =========================================================================================
	return new Date(year, month, day, hour, min, sec);
}
