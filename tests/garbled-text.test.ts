import { describe, expect, it } from "vitest";
import { bodyLooksGarbled, looksGarbled, titleLooksGarbled } from "@/lib/pipeline/garbled";

describe("looksGarbled", () => {
  it("flags real garbled titles from the 2026-11-10 18:25 UTC run", () => {
    expect(looksGarbled("生嫁報導指出黃仁勹婚外情使煌達晶片逅輸中國")).toBe(true);
    expect(looksGarbled("十首掌握德克薩斯嚮音樂精髕的歌曲")).toBe(true);
  });

  it("does not flag normal headlines with names, places and mixed English", () => {
    const titles = [
      "輝達執行長黃仁勳表示 Blackwell 晶片需求遠超預期",
      "OpenAI 發表 GPT-5 新模型，推理能力大幅提升",
      "台積電高雄廠 2 奈米製程進入量產階段",
      "Sigur Rós 宣布來台演出，門票十月開賣",
      "My Bloody Valentine 睽違多年再度發行新專輯",
      "蘋果 iPhone 17 Pro 相機升級，攝影愛好者怎麼看",
      "美國聯準會宣布維持利率不變，市場預期明年降息兩次",
      "日月潭與阿里山：台灣十大夢幻攝影景點完整攻略",
      "Anthropic 推出 Claude 新版本，強化程式開發與長文件處理",
      "烏克蘭與俄羅斯在黑海地區衝突再起，歐盟召開緊急會議",
      "駭客利用 Chrome 零時差漏洞攻擊，Google 緊急釋出修補更新",
      "鄭欣宜、藍心湄與蕭敬騰共同登上跨年晚會舞台",
      "馬斯克的 SpaceX 星艦第六次試飛成功回收助推器",
      "Slowdive 與 Beach House 的夢幻流行：入門專輯推薦",
      "新竹內灣與苗栗南庄：秋季賞楓與攝影路線",
      "美股三大指數收高，那斯達克指數創歷史新高",
    ];
    for (const title of titles) expect(looksGarbled(title), title).toBe(false);
  });

  it("does not flag simplified Chinese or short / non-Chinese text", () => {
    expect(looksGarbled("英伟达发布新一代芯片，推理性能大幅提升")).toBe(false);
    expect(looksGarbled("OpenAI releases a new model")).toBe(false);
    expect(looksGarbled("")).toBe(false);
    expect(looksGarbled("黃仁勹")).toBe(false); // under 8 CJK characters
  });

  it("does not flag a long summary for one uncommon character", () => {
    const summary =
      "導演侯孝賢談《悲情城市》三十年後重新修復的過程與感想，並回顧當年在九份拍攝的種種困難與意外。他也提到對新一代影像創作者的期待。";
    expect(bodyLooksGarbled(summary + "彧")).toBe(false);
    expect(bodyLooksGarbled(summary)).toBe(false);
  });

  it("flags a summary full of look-alike characters", () => {
    expect(
      bodyLooksGarbled("報導指出黃仁勹與煌達晶片逅輸中國，另有髕骼精髕與嚮樂相關內容。"),
    ).toBe(true);
    expect(titleLooksGarbled("十首掌握德克薩斯嚮音樂精髕的歌曲")).toBe(true);
  });
});
