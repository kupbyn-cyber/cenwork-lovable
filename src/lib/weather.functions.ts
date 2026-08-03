import { createServerFn } from "@tanstack/react-start";

/**
 * TODAY-RESET-01 — thời tiết Hà Nội cho banner Trang chủ.
 * Nguồn công khai (không cần API key), cache 45 phút phía server.
 * Lỗi mạng chỉ trả về null: banner ẩn phần thời tiết, không làm hỏng Trang chủ.
 */
export interface HanoiWeather {
  temperature: number;
  description: string;
}

const WEATHER_CODE: Record<number, string> = {
  0: "Trời quang",
  1: "Ít mây",
  2: "Có mây",
  3: "Nhiều mây",
  45: "Sương mù",
  48: "Sương mù giá",
  51: "Mưa phùn nhẹ",
  53: "Mưa phùn",
  55: "Mưa phùn dày",
  61: "Mưa nhẹ",
  63: "Mưa vừa",
  65: "Mưa to",
  71: "Tuyết nhẹ",
  80: "Mưa rào nhẹ",
  81: "Mưa rào",
  82: "Mưa rào mạnh",
  95: "Dông",
  96: "Dông kèm mưa đá",
  99: "Dông mạnh",
};

let cache: { at: number; value: HanoiWeather | null } | null = null;
const CACHE_MS = 45 * 60 * 1000;

export const getHanoiWeather = createServerFn({ method: "GET" }).handler(
  async (): Promise<HanoiWeather | null> => {
    if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
    try {
      const response = await fetch(
        "https://api.open-meteo.com/v1/forecast?latitude=21.0278&longitude=105.8342&current=temperature_2m,weather_code&timezone=Asia%2FBangkok",
      );
      if (!response.ok) throw new Error(`weather ${response.status}`);
      const json = (await response.json()) as {
        current?: { temperature_2m?: number; weather_code?: number };
      };
      const temperature = json.current?.temperature_2m;
      const code = json.current?.weather_code;
      if (typeof temperature !== "number") throw new Error("weather payload");
      const value: HanoiWeather = {
        temperature: Math.round(temperature),
        description: (typeof code === "number" ? WEATHER_CODE[code] : undefined) ?? "Thời tiết ổn định",
      };
      cache = { at: Date.now(), value };
      return value;
    } catch {
      cache = { at: Date.now(), value: null };
      return null;
    }
  },
);