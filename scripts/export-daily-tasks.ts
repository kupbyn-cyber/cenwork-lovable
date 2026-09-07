/**
 * TASK-DAILY-01A — chạy thử export cho một ngày nghiệp vụ.
 *
 *   DATABASE_URL=... CEN_AI_VIEWER_USER_ID=... bun run scripts/export-daily-tasks.ts 2026-09-06
 *
 * Ghi file .xlsx ra thư mục hiện tại. Chỉ dùng cho vận hành/kiểm thử phía máy chủ.
 */
import { writeFile } from "node:fs/promises";

const businessDate = process.argv[2] ?? "";

const { generateDailyTaskReport } = await import("../src/lib/daily-task-export.server");
const report = await generateDailyTaskReport(businessDate);
await writeFile(report.fileName, report.content);
console.log(`${report.fileName} — ${report.rowCount} task`);
