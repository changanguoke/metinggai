/**
 * @file lyric.js
 * @description LRC 歌词解析与格式化工具 - 将原始歌词和翻译歌词按时间轴合并
 *              输出格式为标准 LRC 格式：`[mm:ss.xxx]原文 (翻译)`
 */

/**
 * 合并原文歌词与翻译歌词，按时间轴对齐后输出 LRC 格式字符串
 *
 * @param {string} lyric - 原文歌词（LRC 格式字符串）
 * @param {string} tlyric - 翻译歌词（LRC 格式字符串，可选）
 * @returns {string} 合并后的 LRC 格式歌词，每行格式为 `[mm:ss.xxx]原文 (翻译)`
 */
export function format (lyric, tlyric) {
  // 将歌词文本解析为按时间排序的结构化数组
  const lyricArray = trimLyric(lyric)
  const tlyricArray = trimLyric(tlyric)

  // 无翻译歌词时直接返回原文
  if (tlyricArray.length === 0) {
    return lyric
  }

  const result = []
  // 双指针遍历：i 指向原文，j 指向翻译，按时间轴对齐合并
  for (let i = 0, j = 0; i < lyricArray.length && j < tlyricArray.length; i += 1) {
    const time = lyricArray[i].time
    let text = lyricArray[i].text

    // 移动翻译指针直到时间不小于当前原文时间（找到最近的翻译行）
    while (time > tlyricArray[j].time && j + 1 < tlyricArray.length) {
      j += 1
    }

    // 时间戳匹配且有翻译内容时，将翻译追加到原文后面（用括号包裹）
    if (time === tlyricArray[j].time && tlyricArray[j].text.length) {
      text = `${text} (${tlyricArray[j].text})`
    }

    result.push({ time, text })
  }

  // 将结构化数据序列化为标准 LRC 格式字符串
  return result
    .map(x => {
      // 将毫秒时间戳拆分为 分:秒.毫秒 的 LRC 标准格式
      const minus = Math.floor(x.time / 60000).toString().padStart(2, '0') // 分钟（补零到 2 位）
      const second = Math.floor((x.time % 60000) / 1000).toString().padStart(2, '0') // 秒（补零到 2 位）
      const millisecond = Math.floor((x.time % 1000)).toString().padStart(3, '0') // 毫秒（补零到 3 位）
      return `[${minus}:${second}.${millisecond}]${x.text}`
    })
    .join('\n')
}

/**
 * 解析 LRC 格式歌词文本为结构化数组
 * 每行格式为 `[mm:ss.xxx]歌词内容`，解析为 `{ time: 毫秒数, text: 歌词文本 }`
 * 结果按时间升序排列
 *
 * @param {string} lyric - LRC 格式的原始歌词字符串
 * @returns {Array<{time: number, text: string}>} 解析后的歌词数组（按时间排序）
 */
const trimLyric = (lyric) => {
  const result = []
  const lines = lyric.split('\n')
  for (const line of lines) {
    // 使用正则匹配 LRC 时间标签，支持 1-3 位分钟数（兼容不同平台格式）
    // 标准格式 [mm:ss.xx]，宽松匹配以兼容酷狗等平台的变体
    const match = line.match(/^\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\](.*)$/)
    if (match) {
      result.push({
        time: parseInt(parseInt(match[1], 10) * 60 * 1000 + parseFloat(match[2]) * 1000 + (match[3] ? parseInt(match[3], 10) : 0)),
        text: match[4] // 时间标签后面的歌词正文
      })
    }
  }
  // 按时间升序排列（防止源文件乱序的情况）
  return result.sort((a, b) => a.time - b.time)
}
