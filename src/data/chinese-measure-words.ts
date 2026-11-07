/**
 * Chinesische Zählwörter (量词) mit Pinyin (07.11.2026).
 *
 * Zwischen Zahl und Nomen steht im Chinesischen ein Zählwort — en.wikipedia
 * „Chinese classifier“, abgerufen am 2026-11-07: „In the Chinese equivalent
 * of a phrase such as "three books" or "that person", it is normally
 * necessary to insert an appropriate classifier between the
 * numeral/demonstrative and the noun.“ 个 ist das häufigste („General
 * classifier (gè in Standard Chinese, go3 in Cantonese), the most common
 * Chinese classifier“).
 *
 * Diese Liste ist die Menge, die ein Wort in `chineseNoun.measureWord`
 * tragen darf (Schema-Prüfung) — mit dem Pinyin, das die Übung zeigt.
 */
export const MEASURE_WORDS: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries({
    个: 'gè', 本: 'běn', 张: 'zhāng', 杯: 'bēi', 只: 'zhī', 条: 'tiáo', 件: 'jiàn', 辆: 'liàng',
    位: 'wèi', 名: 'míng', 把: 'bǎ', 双: 'shuāng', 对: 'duì', 瓶: 'píng', 台: 'tái', 家: 'jiā',
    块: 'kuài', 碗: 'wǎn', 盘: 'pán', 座: 'zuò', 栋: 'dòng', 棵: 'kē', 朵: 'duǒ', 支: 'zhī',
    枝: 'zhī', 根: 'gēn', 封: 'fēng', 部: 'bù', 节: 'jié', 套: 'tào', 头: 'tóu', 匹: 'pǐ',
    份: 'fèn', 口: 'kǒu', 间: 'jiān', 片: 'piàn', 顶: 'dǐng', 盒: 'hé', 包: 'bāo', 袋: 'dài',
    箱: 'xiāng', 首: 'shǒu', 篇: 'piān', 句: 'jù', 段: 'duàn', 架: 'jià', 艘: 'sōu', 颗: 'kē',
    粒: 'lì', 面: 'miàn', 扇: 'shàn', 道: 'dào', 层: 'céng', 所: 'suǒ', 门: 'mén', 种: 'zhǒng',
    群: 'qún', 幅: 'fú', 副: 'fù', 串: 'chuàn', 束: 'shù', 壶: 'hú', 锅: 'guō', 罐: 'guàn',
    场: 'chǎng', 项: 'xiàng', 笔: 'bǐ', 堂: 'táng', 班: 'bān', 届: 'jiè', 期: 'qī', 辈: 'bèi',
    滴: 'dī', 排: 'pái', 块儿: 'kuàir', 次: 'cì', 趟: 'tàng', 顿: 'dùn', 阵: 'zhèn', 声: 'shēng',
    盏: 'zhǎn', 枚: 'méi', 列: 'liè', 轮: 'lún', 卷: 'juǎn', 堆: 'duī', 批: 'pī', 桌: 'zhuō',
    处: 'chù', 款: 'kuǎn', 剂: 'jì', 册: 'cè', 株: 'zhū', 圈: 'quān',
  }).map(([zeichen, pinyin]) => [zeichen, pinyin.normalize('NFC')])
);

/** Ist das ein bekanntes Zählwort? */
export function isMeasureWord(value: unknown): value is string {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(MEASURE_WORDS, value);
}

/**
 * 一 vor dem Zählwort: zweiter Ton vor einem vierten Ton (一个 yí gè, 一块
 * yí kuài), sonst vierter Ton (一本 yì běn) — en.wikipedia „Standard Chinese
 * phonology“, Abschnitt „Tone sandhi“.
 */
export function yiVor(pinyin: string): 'yí' | 'yì' {
  return /[àèìòùǜ]/u.test(pinyin.normalize('NFC')) ? 'yí' : 'yì';
}
