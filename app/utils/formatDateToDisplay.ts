// formatDateToDisplay.ts
export default function (date: Date): string {
	const pad = (n: number) => n.toString().padStart(2, "0");

	const year = date.getFullYear();
	const month = pad(date.getMonth() + 1);
	const day = pad(date.getDate());
	const hour = pad(date.getHours());
	const min = pad(date.getMinutes());
	const sec = pad(date.getSeconds());

	// "2025. 12. 31. 16:02:33" 형식 반환
	return `${year}. ${month}. ${day}. ${hour}:${min}:${sec}`;
}