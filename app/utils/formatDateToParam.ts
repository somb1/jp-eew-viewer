/**
 * API 요청을 위한 날짜 포맷터
 * - Date 객체를 API에서 요구하는 "YYYYMMDDHHmmss" 형식의 문자열로 변환합니다.
 * - 주로 K-moni 등의 기상청/지진 API URL 파라미터 생성에 사용됩니다.
 *
 * @param date 포맷팅할 Date 객체
 * @returns "YYYYMMDDHHmmss" (예: "20250101123005")
 */
export default function formatDateToParam(date: Date): string {
	// =========================================================================================
	// 1. 내부 헬퍼 함수: 제로 패딩 (Zero Padding)
	// =========================================================================================
	// 숫자가 1자리일 경우 앞에 '0'을 붙여 2자리 문자열로 반환합니다.
	const pad = (n: number) => n.toString().padStart(2, "0");

	// =========================================================================================
	// 2. 날짜 요소 추출 및 문자열 결합
	// =========================================================================================
	// 구분자 없이 모든 숫자를 이어 붙입니다.
	return (
		date.getFullYear().toString() +
		pad(date.getMonth() + 1) + // [주의] getMonth()는 0~11을 반환하므로 +1 필요
		pad(date.getDate()) +
		pad(date.getHours()) +
		pad(date.getMinutes()) +
		pad(date.getSeconds())
	);
}
