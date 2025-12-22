/**
 * API 适配器 - Marriott AI Mock 响应
 */

// ============ Mock 响应 ============

const RESPONSE_DEFAULT = `你好！我是 Marriott 智能助手。

我可以帮助您：

🏨 **酒店预订**
- 查询房间可用性
- 推荐合适的房型
- 处理预订变更

✈️ **旅行规划**
- 目的地推荐
- 行程安排建议
- 当地活动推荐

🎁 **会员服务**
- 积分查询与兑换
- 会员等级权益
- 专属优惠活动

请告诉我您需要什么帮助？`;

const RESPONSE_BOOKING = `🏨 **房间预订服务**

我可以帮您查询以下信息：

**热门目的地推荐**

| 城市 | 酒店 | 价格/晚 | 评分 |
|------|------|---------|------|
| 上海 | JW Marriott 上海明天广场 | ¥1,280 起 | ⭐ 4.8 |
| 北京 | The Ritz-Carlton 北京 | ¥1,580 起 | ⭐ 4.9 |
| 三亚 | St. Regis 三亚亚龙湾 | ¥2,380 起 | ⭐ 4.9 |
| 成都 | W Hotel 成都 | ¥980 起 | ⭐ 4.7 |

---

**预订流程**

1️⃣ 告诉我您的目的地和入住日期
2️⃣ 我会为您查询可用房型
3️⃣ 确认房型后完成预订

请问您想预订哪个城市的酒店？入住日期是什么时候？`;

const RESPONSE_MEMBER = `🎁 **Marriott Bonvoy 会员服务**

---

### 会员等级权益

| 等级 | 积分倍率 | 房型升级 | 延迟退房 | 行政酒廊 |
|------|----------|----------|----------|----------|
| Member | 10x | - | - | - |
| Silver | 10x | ✓ | 2pm | - |
| Gold | 12.5x | ✓ | 2pm | - |
| Platinum | 15x | ✓ | 4pm | ✓ |
| Titanium | 17.5x | ✓ | 4pm | ✓ |
| Ambassador | 17.5x | ✓✓ | 4pm | ✓ |

---

### 积分兑换指南

- **免费房晚**: 5,000 - 100,000 积分/晚
- **航空里程**: 3:1 兑换比例
- **礼品卡**: 10,000 积分起兑

---

请问您想了解哪方面的会员服务？`;

// ============ 关键词匹配规则 ============

interface MatchRule {
  keywords: string[];
  response: string;
}

const MATCH_RULES: MatchRule[] = [
  {
    keywords: ["预订", "订房", "房间", "酒店", "住宿", "入住", "预定"],
    response: RESPONSE_BOOKING,
  },
  {
    keywords: ["会员", "积分", "等级", "权益", "兑换", "Bonvoy"],
    response: RESPONSE_MEMBER,
  },
];

/**
 * 计算消息与规则的匹配分数
 */
function calculateMatchScore(message: string, rule: MatchRule): number {
  const lowerMessage = message.toLowerCase();
  let score = 0;
  
  for (const keyword of rule.keywords) {
    if (lowerMessage.includes(keyword.toLowerCase())) {
      score += 1;
    }
  }
  
  return score;
}

/**
 * 查找最佳匹配的响应
 */
function findBestResponse(message: string): string {
  let bestScore = 0;
  let bestResponse = RESPONSE_DEFAULT;
  
  for (const rule of MATCH_RULES) {
    const score = calculateMatchScore(message, rule);
    if (score > bestScore) {
      bestScore = score;
      bestResponse = rule.response;
    }
  }
  
  // 至少需要匹配 1 个关键词才返回专业回答
  if (bestScore < 1) {
    return RESPONSE_DEFAULT;
  }
  
  return bestResponse;
}

// ============ 流式响应模拟 ============

/**
 * 模拟流式响应
 */
function simulateStreaming(
  text: string,
  onChunk?: (chunk: string) => void
): Promise<string> {
  return new Promise((resolve) => {
    const chars = Array.from(text);
    let currentText = "";
    let index = 0;
    
    const totalChars = chars.length;
    const targetDuration = 6000; // 6 秒
    const interval = Math.max(5, Math.min(30, targetDuration / totalChars));

    const timer = setInterval(() => {
      if (index < chars.length) {
        const chunkSize = Math.min(3, chars.length - index);
        const chunk = chars.slice(index, index + chunkSize).join("");
        currentText += chunk;
        onChunk?.(chunk);
        index += chunkSize;
      } else {
        clearInterval(timer);
        resolve(currentText);
      }
    }, interval);
  });
}

// ============ 主函数 ============

/**
 * 模拟 AI 响应
 */
export async function simulateAIResponse(
  message: string,
  onChunk?: (chunk: string) => void
): Promise<string> {
  // 模拟 AI 思考延迟（3 秒）
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // 查找最佳匹配的响应
  const response = findBestResponse(message);

  // 模拟流式响应
  return await simulateStreaming(response, onChunk);
}



