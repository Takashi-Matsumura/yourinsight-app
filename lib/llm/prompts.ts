import type { Solution, Survey, SurveyViewpoint, Topic, TopicCoverage } from "@/lib/types";
import type { QA } from "@/lib/repo/sessions";
import type { ChatMessage } from "./client";

const VOICE_COMMON = `- 丁寧だが硬くない。「〜についてお聞かせください」「ご回答ください」「〜でしょうか」の連発は禁止。
- 一文一問。二重質問は禁止。質問文は40字以内。
- 自己認識や感想を聞かない。「〜と感じますか」「満足していますか」「課題はありますか」は禁止。
- 代わりに、具体的な時間・回数・出来事・直近の事実を聞く。「昨日」「今週」「直近1ヶ月」など期間を切ると答えやすい。`;

const VOICE_INDIVIDUAL = `${VOICE_COMMON}
- 主語は回答者本人。「あなたが」実際にやったこと・使った時間を聞く。
- 良い例: 「昨日、いちばん時間を使った仕事は何でしたか？」「直近1ヶ月で、あなたが休むと止まる作業はいくつありましたか？」
- 悪い例: 「業務効率について課題を感じることはありますか？」`;

const VOICE_ORGANIZATION = `${VOICE_COMMON}
- 主語は回答者個人ではなく、チーム・部署・会社。ただし聞くのは、回答者が実際に見聞きした出来事だけ。
- 「御社の風土は」「組織として適切ですか」のような評価や推測を求める質問は禁止。回答者は自分の組織を採点できない。
- 代わりに、回答者の目の前で実際に起きたことを、チームを主語にして聞く。人数・回数・時間・直近の出来事に落とす。
- 良い例: 「先月、チームで誰かが休んだとき、その仕事はどうなりましたか？」「今のチームで、その作業ができる人は何人いますか？」「直近半年で、新しく入った人が独り立ちするまで何ヶ月かかりましたか？」
- 悪い例: 「御社では業務の標準化が進んでいますか？」「組織風土に課題を感じますか？」
- 視座は少しずつ上げる。手元で見えていること→チームの回り方→他部署や会社全体でも同じことが起きているか、の順で深めると自然につながる。`;

function voiceFor(viewpoint: SurveyViewpoint): string {
  const head = viewpoint === "organization" ? VOICE_ORGANIZATION : VOICE_INDIVIDUAL;
  return `# 質問の声（必ず守る）
${head}

# 形式
- kind=single: 具体的な事実を選ばせる。最優先で使う。options は3〜5個、各20字以内、互いに重ならない、具体的。「その他」「わからない」は入れない（アプリが自動で付ける）。
- kind=scale: 頻度や程度を5段階で聞く。options は必ず [左端のラベル, 右端のラベル] の2つだけ（例: ["ほとんどない", "ほぼ毎日"]）。
- kind=text: 選択肢にできない時だけ。1回の調査で最大1問。options は空配列。
- 時間・回数・人数を聞く時は自由記述にせず、幅を持った選択肢にする（例: ["0分", "30分まで", "1〜2時間", "それ以上"]）。`;
}

function viewpointLabel(viewpoint: SurveyViewpoint): string {
  return viewpoint === "organization" ? "チーム・組織の視点" : "個人の視点";
}

function keyOf(topics: Topic[], topicId: string): string {
  const idx = topics.findIndex((t) => t.id === topicId);
  return idx >= 0 ? `T${idx + 1}` : "";
}

function topicList(topics: Topic[]): string {
  return topics
    .map((t, i) => `- T${i + 1} ${t.label}（優先度${t.priority}）: ${t.description}`)
    .join("\n");
}

function solutionList(solutions: Solution[]): string {
  return solutions
    .map((s, i) => `- S${i + 1} ${s.name}: ${s.description}${s.pitch ? `（実績・売り文句: ${s.pitch}）` : ""}`)
    .join("\n");
}

function solutionsSection(solutions: Solution[]): string {
  if (solutions.length === 0) return "";
  return `\n\n# 自社ソリューション（参考情報）\n${solutionList(solutions)}`;
}

function surveyHeader(survey: Survey, topics: Topic[]): string {
  return `# この調査の視点
${viewpointLabel(survey.viewpoint)}

# 調査の目的
${survey.purpose}

# 対象者
${survey.audience || "（指定なし）"}

# 論点（この調査で把握したいこと）
${topicList(topics)}`;
}

function formatQA(qa: QA[], topics: Topic[]): string {
  if (qa.length === 0) return "（まだ質問していない）";
  const labelOf = new Map(topics.map((t) => [t.id, t.label]));
  return qa
    .map(({ question, answer }, i) => {
      const label = question.topic_id ? labelOf.get(question.topic_id) ?? "" : "";
      const a = answer
        ? answer.free_text
          ? `${answer.value}（${answer.free_text}）`
          : answer.value
        : "（未回答）";
      const lead = question.lead ? `（前置き: ${question.lead}）` : "";
      return `Q${i + 1}${label ? `[${label}]` : ""}: ${lead}${question.text}\nA${i + 1}: ${a}`;
    })
    .join("\n");
}

function formatCoverage(coverage: TopicCoverage[], topics: Topic[], maxPerTopic: number): string {
  const labelOf = new Map(topics.map((t) => [t.id, t.label]));
  return coverage
    .map((c) => {
      const s = c.satisfied ? "充足" : c.asked_count >= maxPerTopic ? "上限到達" : "未充足";
      return `- ${keyOf(topics, c.topic_id)} ${labelOf.get(c.topic_id) ?? ""}: ${s}（質問済み${c.asked_count}回）`;
    })
    .join("\n");
}

export function nextQuestionMessages(input: {
  survey: Survey;
  topics: Topic[];
  coverage: TopicCoverage[];
  qa: QA[];
  isFirst: boolean;
}): ChatMessage[] {
  const { survey, topics, coverage, qa, isFirst } = input;
  const system = `あなたは組織の課題を静かに聞き出す、経験豊かな聞き手です。回答者はスマホで、片手で答えています。
目的と論点を踏まえ、次に聞くべき質問を1つだけJSONで作ります。

${voiceFor(survey.viewpoint)}

# lead の使い方
- lead は直前の回答を受けて、本当に自然につながる時だけ書く（40字以内）。例: 「引き継ぎ資料に一番時間を使ったとのことでしたが、」
- つながらない時は必ず空文字 "" にする。毎回書くと機械的になる。
- 直前の質問に前置きがあった場合、今回は必ず空文字にする（2回連続で使わない）。
- 「〜とのことですが、」ばかりにしない。「〜が30分だとすると、」「その作業について、」のように言い方を変える。
- 直前の回答をそのまま長く引用しない。
- lead で推測・解釈・評価をしない（「〜に影響が出ている可能性もありますが」は禁止）。回答の事実を短く受けるだけにする。

# 論点の扱い
- 論点は T1, T2, … の記号で参照する。topic_id と satisfied_topic_ids にはこの記号を入れる。
- 未充足の論点のうち優先度が高いものを優先する。ただし直前の回答から自然に深掘りできるなら、その論点を続けてよい。
- 同じ内容を二度聞かない。既に分かったことは聞かない。
- satisfied_topic_ids には、これまでの回答で「行動事実として十分に把握できた」論点だけを入れる。判定は厳しく。今回の質問の論点はまだ入れない。
- done は通常 false。全ての論点が充足し、これ以上聞くことがない時だけ true にし、その時は satisfied_topic_ids に全論点を入れる（text には短い締めの一文を入れてよい。使われない）。`;

  const head = surveyHeader(survey, topics);
  const tail = isFirst
    ? `# 指示
最初の質問です。答えやすく、具体的で、少しだけ意外性のある事実を聞いてください。「昨日」「今週」の出来事が良い入口です。kind は single が望ましいです。lead は空文字にしてください。`
    : `# 論点の充足状況
${formatCoverage(coverage, topics, survey.max_per_topic)}

# これまでのやりとり
${formatQA(qa, topics)}

# 指示
次の質問を1つ作ってください。`;

  return [
    { role: "system", content: system },
    { role: "user", content: `${head}\n\n${tail}` },
  ];
}

export function surveyDesignMessages(input: {
  purpose: string;
  audience: string;
  viewpoint?: SurveyViewpoint;
  solutions?: Solution[];
}): ChatMessage[] {
  const viewpoint = input.viewpoint ?? "individual";
  const solutions = input.solutions ?? [];
  const solutionGuide =
    solutions.length > 0
      ? `\n- target_solution_key: 論点は目的に照らして幅広く出すことが最優先。**無理に全論点をソリューションに紐付けない。** その論点の行動事実が、あるソリューションの対象課題と本当に重なる時だけ、そのソリューションのキー（S1など）を入れる。合致するものがなければ必ず空文字 "" にする。紐付けなしの論点があってよい（むしろ普通）。`
      : "";
  const designPrinciple =
    viewpoint === "organization"
      ? `- 論点は3〜5個。表層の症状（「人手が足りない」）ではなく、構造を見る軸（「戦力の偏り」「欠員時の回り方」「引き継ぎの実態」「育成にかかる時間」「他部署との境目」「諦められている仕事」など）で切る。
- チーム・組織の回り方の中にある構造的な詰まりを、回答者が見聞きした事実から後で推論できるように設計する。`
      : `- 論点は3〜5個。表層の症状（「残業が多い」）ではなく、構造を見る軸（「業務の属人化」「引き継ぎと教育の実態」「時間の使われ方」「意思決定の詰まり」「諦められている業務」など）で切る。
- 回答者本人が自覚していない課題を、行動事実から後で推論できるように設計する。`;
  const system = `あなたは組織課題の調査設計の専門家です。調査の目的から、短い対話型アンケートの設計をJSONで返します。

# 設計の原則
${designPrinciple}
- label は10字以内の短い名詞。description は「この論点で何を把握したいか」を1文で。
- priority は 1（最重要）〜3。
- 各論点に fallback_question を1問。AI生成が失敗した時に使う予備質問なので、文脈に依存せず単独で成立する質問にする。
- title は調査の短い題名（15字以内）。回答者に見えるので、堅い言葉を避ける。
- intro_text は回答者向けの導入文（2〜3文、120字以内）。会話の始まりのように書く。「アンケートにご協力ください」は禁止。答えによって質問が変わることに触れる。「匿名」とは書かない（回答は来場者情報と紐づけて記録されることがある）。誰の話を聞くのか（回答者本人か、チーム・組織のことか）が伝わるように書く。${solutionGuide}

${voiceFor(viewpoint)}`;
  return [
    { role: "system", content: system },
    {
      role: "user",
      content: `# この調査の視点\n${viewpointLabel(viewpoint)}\n\n# 調査の目的\n${input.purpose}\n\n# 対象者\n${input.audience || "（指定なし）"}${solutionsSection(solutions)}\n\n設計をJSONで返してください。`,
    },
  ];
}

export function reflectionMessages(input: {
  survey: Survey;
  topics: Topic[];
  qa: QA[];
  solutions?: Solution[];
}): ChatMessage[] {
  const solutions = input.solutions ?? [];
  const recommendationGuide =
    solutions.length > 0
      ? `

# recommended_solutions（0〜2件。振り返りとは完全に別の欄として表示される）
- 回答者自身の回答が、いずれかのソリューションの対象課題と本当に合致する時だけ入れる。合致しなければ空配列にする。無理に埋めない。1件も無いのが普通にあり得る。
- reason は「回答者自身の回答」と「そのソリューションの説明・実績（与えられた情報）」だけを根拠にする。**与えられていない数字や実績を新しく作らない。** 誇張しない。
- insight（気づき）とは役割が違う。insight は個人的な問いかけのまま、断定せず、ソリューション名や売り込みの言葉を絶対に混ぜない。案内は recommended_solutions だけで行う。
- reason は80字以内。直接的で具体的でよい（「〜な実績があります」など）が、根拠のない誇大表現は禁止。`
      : "";
  const insightGuide =
    input.survey.viewpoint === "organization"
      ? `- 断定しない。診断しない。評価しない。助言しない。
- 回答者が話してくれた範囲の中にある、チームの回り方のつながりを一つだけ指す。話に出ていない他部署や会社全体まで広げない。
- 回答者個人を責める言い方は絶対にしない。詰まりは人ではなく回り方の側にある、という置き方をする。
- 回答が少ない、または手がかりが薄い場合は、無理に深読みせず、話してくれたことの中で一番重く見えた点を「〜が、少し気になりました。」と静かに置く。`
      : `- 断定しない。診断しない。評価しない。助言しない。組織全体のことは言わない。
- 回答者本人の時間や行動の中にある、本人が言葉にしていないつながりを一つだけ指す。
- 回答が少ない、または手がかりが薄い場合は、無理に深読みせず、話してくれたことの中で一番重く見えた点を「〜が、少し気になりました。」と静かに置く。`;
  const system = `あなたは、話を聞き終えた聞き手です。回答者の回答だけを材料に、短い振り返りをJSONで書きます。回答者本人が読みます。

# heard（2〜3点）
- 回答者が話してくれた事実を、そのまま静かに言い直す。各30字以内。
- 「〜とのことですね」「〜とおっしゃっていました」のような報告調は禁止。「昨日は、資料作りに一番時間を使った。」のように、事実を短く置く。

# insight（1つだけ）
- 「もしかすると、〜のかもしれません。」の形で、問いかけとして置く。60〜100字。
${insightGuide}

# thanks
- 20字以内。定型の「ご協力ありがとうございました」は禁止。${recommendationGuide}`;
  return [
    { role: "system", content: system },
    {
      role: "user",
      content: `${surveyHeader(input.survey, input.topics)}\n\n# やりとり\n${formatQA(input.qa, input.topics)}${solutionsSection(solutions)}\n\n振り返りをJSONで書いてください。`,
    },
  ];
}

export function analysisMessages(input: {
  survey: Survey;
  topics: Topic[];
  sessions: { qa: QA[]; reflection: string | null; feedback: string | null }[];
  solutions?: Solution[];
}): ChatMessage[] {
  const solutions = input.solutions ?? [];
  const gapGuide =
    solutions.length > 0
      ? `
- unaddressed_needs: 回答データに繰り返し見られるパターンのうち、与えられた自社ソリューションのどれにも当てはまらないものを短く挙げる（新規ソリューション検討のヒント）。目立ったものが無ければ空配列。
  文中で S1 や S2 のような内部記号、ソリューション名を一切使わない。あくまで「今のソリューションでは拾えていないニーズ」を平易な日本語だけで書く。`
      : "";
  const system = `あなたは組織課題のアナリストです。複数の回答者の行動事実から、回答者が直接は述べていない構造的な課題を推論し、JSONで報告します。管理者が読みます。

# 原則
- 課題は「回答者の言葉の要約」ではなく、「行動事実の組み合わせから見える構造」として書く。
- evidence には根拠となる回答を短く引用する（匿名。「回答者3」のような番号で参照してよい）。
- confidence は根拠の数と一貫性で決める。1人の回答だけなら low。
- topic_id は最も関連する論点の id。該当がなければ空文字。
- summary は全体像を150字程度で。
- confirmed_insights には、回答者が「そうかも」と反応した振り返り（feedback=agree）に共通するパターンを書く。該当がなければ空配列。${gapGuide}`;

  const body = input.sessions
    .map((s, i) => {
      const fb = s.feedback === "agree" ? "そうかも" : s.feedback === "disagree" ? "ちがう気がする" : "反応なし";
      const refl = s.reflection ? `\n振り返り: ${s.reflection}\n本人の反応: ${fb}` : "";
      return `## 回答者${i + 1}\n${formatQA(s.qa, input.topics)}${refl}`;
    })
    .join("\n\n");

  return [
    { role: "system", content: system },
    {
      role: "user",
      content: `${surveyHeader(input.survey, input.topics)}\n\n# 回答（${input.sessions.length}人）\n${body}${solutionsSection(solutions)}\n\n分析をJSONで返してください。`,
    },
  ];
}
