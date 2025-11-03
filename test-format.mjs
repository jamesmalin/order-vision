import { formatDates } from "./format-dates.mjs";

const dateStr = "2026/9/17";
const US = false;
const result = await formatDates(US, dateStr);
console.log(result);