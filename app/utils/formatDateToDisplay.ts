export default function (date: Date): string {
	return date.toLocaleString("ko-KR", { hour12: false });
}
