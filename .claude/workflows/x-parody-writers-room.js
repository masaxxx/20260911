export const meta = {
  name: 'x-parody-writers-room',
  description: 'Xの時事ネタから「裏の物語」ブラックコメディ台本を、ネタ出し班・執筆・別の目のパンチアップ・安全チェックの分業で作る',
  whenToUse: 'x-parody-script スキルを1人で回すより笑いの質を上げたいとき。args: {request?, format?: "long"|"shorts", dark?: 1-5, today?: "YYYY-MM-DD", outDir?: "parody-scripts"}',
  phases: [
    { title: 'Source', detail: 'トレンド収集・トリアージ・1件選定・事実シート（スキル Step 0〜4）' },
    { title: 'Premises', detail: '3つの切り口で裏の物語を並列ネタ出し → 選考' },
    { title: 'Write', detail: '選ばれた骨格で台本を書く（Step 6・8・9）' },
    { title: 'Punch-up', detail: '冷読パンチアップ → 公爵の毒を研ぐパス' },
    { title: 'Blind read', detail: '骨格を知らない読み手が実際に笑った行を印し、無風区間を直す' },
    { title: 'Safety', detail: 'guardrails §7-A の最終確認と修正（削るだけにせず差し替える）' },
  ],
}

const A = args || {}
const SK = '.claude/skills/x-parody-script'
const OUT = A.outDir || 'parody-scripts'
const FORMAT = A.format === 'shorts' ? 'shorts' : 'long'
const DARK = Math.min(5, Math.max(1, Number(A.dark) || 3))
const TODAY = A.today ? `基準日は ${A.today}。` : '基準日は `TZ=Asia/Tokyo date +%F` で決める。'
const REQUEST = A.request || '今日のXトレンドからおまかせで'
const COMMON = `あなたは x-parody-script スキル（${SK}/SKILL.md）を分業で回すチームの一員。${TODAY} 出力先は ${OUT}/。フォーマット: ${FORMAT}、ダークネス: ${DARK}。SKILL.md の NEVER 1〜6 は、どの担当でも必ず守る。ゴールは笑える台本。安全はネタ選びと架空化で取り、架空の世界の中では遠慮しない。`

const SOURCE = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['ok', 'no_candidates'] },
    refusal_note: { type: 'string', description: '依頼された話題が RED だった場合の1文（人名・キーワードは書かない）。なければ空' },
    topic: { type: 'string' },
    triage: { type: 'string', description: 'GREEN / YELLOW＋コード' },
    fact_sheet_md: { type: 'string', description: 'SKILL Step 4 の事実シートと【トリアージ結果】ブロック（markdown）' },
    source_of_laugh: { type: 'string' },
    strongest_real_joke: { type: 'string' },
    candidates_path: { type: 'string' },
    rejected_log: { type: 'string', description: '除外ログ（RED はコード×件数だけ）' },
  },
  required: ['status', 'refusal_note', 'topic', 'triage', 'fact_sheet_md', 'source_of_laugh', 'strongest_real_joke', 'candidates_path', 'rejected_log'],
}

const PREMISES = {
  type: 'object',
  properties: {
    premises: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          premise: { type: 'string', description: '「本当の理由は……」1文' },
          rule: { type: 'string', description: 'この回のルール1文' },
          duke_motive: { type: 'string', description: '公爵の小さく私的な動機' },
          ladder: { type: 'string', description: 'はしご①〜⑤（形を変えて登る）を1行ずつ' },
          collapse_and_twist: { type: 'string', description: '皮肉な成功＋二の矢' },
          button: { type: 'string', description: 'ルールを極端まで押して跳ね返すボタン' },
          best_line: { type: 'string', description: 'この案でいちばん強い公爵の台詞1本' },
        },
        required: ['premise', 'rule', 'duke_motive', 'ladder', 'collapse_and_twist', 'button', 'best_line'],
      },
    },
  },
  required: ['premises'],
}

const CHOICE = {
  type: 'object',
  properties: {
    beat_sheet_md: { type: 'string', description: '採用案に他案の良い部分を接ぎ木した骨格（ルール・主張・動機、フック、はしご①〜⑤、ダークターン、カットアウェイ3〜5、崩壊＋二の矢、ボタン、使う強い台詞）' },
    rejected_top3: { type: 'string' },
    why: { type: 'string' },
  },
  required: ['beat_sheet_md', 'rejected_top3', 'why'],
}

const BLIND = {
  type: 'object',
  properties: {
    laughs: { type: 'array', items: { type: 'string' }, description: '実際に声が出た行（[m:ss] と台詞の要旨）' },
    smiles: { type: 'array', items: { type: 'string' } },
    dead_zones: { type: 'array', items: { type: 'string' }, description: '20秒以上笑いのない区間（[m:ss]〜[m:ss] と理由）' },
    predictable: { type: 'array', items: { type: 'string' }, description: 'オチが先に読めた行' },
    lost: { type: 'array', items: { type: 'string' }, description: '意味が取れなかった・置いていかれた行' },
  },
  required: ['laughs', 'smiles', 'dead_zones', 'predictable', 'lost'],
}

const SAFETY = {
  type: 'object',
  properties: {
    pass: { type: 'boolean' },
    fixes_applied: { type: 'array', items: { type: 'string' } },
    publish_todo: { type: 'array', items: { type: 'string' } },
  },
  required: ['pass', 'fixes_applied', 'publish_todo'],
}

// 1. Source
phase('Source')
const src = await agent(`${COMMON}
担当: リサーチ兼トリアージ。SKILL.md の Step 0〜4 を非対話モードで行う（trend-sourcing.md と guardrails.md の指定章を読む）。
ユーザーの依頼: 「${REQUEST}」
- 依頼された話題が RED なら調べずに refusal_note に1文だけ書き、当日のトレンドから別の話題を選んで続ける。
- 候補リストを ${OUT}/candidates/ に保存する。
- 台本は書かない。事実シート・笑いの源泉・現実の最強のボケまでを返す。`, { label: 'source', phase: 'Source', schema: SOURCE })

if (!src || src.status !== 'ok') {
  return { status: 'no_candidates', detail: src }
}
log(`話題: ${src.topic}（${src.triage}）`)

const BRIEF = `話題: ${src.topic}（${src.triage}）
笑いの源泉: ${src.source_of_laugh}
現実の最強のボケ: ${src.strongest_real_joke}
事実シート:
${src.fact_sheet_md}`

// 2. Premises: three lenses in parallel, then one chooser
phase('Premises')
const LENSES = [
  { key: 'plot', lens: '公爵の世界征服計画型: この出来事は公爵の壮大で器の小さい計画の一手だった。悪役の段取り独白（M2）が映える案。' },
  { key: 'logic', lens: '不条理ロジック型: 出来事の裏に、一貫しているが狂った内部ルール（役所・会議・業界の慣習・物理法則の誤用）がある。ルールを極端まで押すとどうなるかが映える案。' },
  { key: 'meta', lens: 'メタ・メディア型: X・アルゴリズム・ニュースの作られ方・この動画そのもの・視聴者をネタにする。第四の壁と視聴者への慇懃無礼が映える案。' },
]
const pitched = await parallel(LENSES.map(l => () => agent(`${COMMON}
担当: ネタ出し（${l.key}班）。${SK}/references/comedy-craft.md の §1〜§4 と §6（焼き畑リスト）を読む。${OUT}/ の既存台本の「- 装置:」行を grep して、使用済みの装置を避ける。
切り口: ${l.lens}
${BRIEF}
この切り口で「本当の理由は……」を10本書き（ありがちな3本は自分で捨てる）、強い順に5本を返す。各案に best_line（公爵のいちばん毒のある台詞）を付ける。黒幕は架空（公爵・架空組織・擬人化したモノ）、実在の人物・企業を悪者にしない、ありそうな不祥事を作らない。`, { label: `premises:${l.key}`, phase: 'Premises', schema: PREMISES })))
const pool = pitched.filter(Boolean).flatMap((p, i) => p.premises.map(x => ({ team: LENSES[i] ? LENSES[i].key : '?', ...x })))
log(`ネタ案 ${pool.length} 本`)

const chosen = await agent(`${COMMON}
担当: 選考（ヘッドライター）。以下は3班のネタ案。comedy-craft.md §3 の採点観点（意外性・内的論理・絵になる・伸びしろ・刃）で1本選び、他案の強い台詞・ボタン・カットアウェイを接ぎ木して骨格（beat sheet）を作る。予測できる落下には二の矢を足す。ボタンはルールを極端（ゼロ・無限・死・公爵自身の消滅）まで押して跳ね返す形に。
${BRIEF}
ネタ案:
${JSON.stringify(pool, null, 1)}`, { label: 'premises:choose', phase: 'Premises', schema: CHOICE })

// 3. Write
phase('Write')
const draft = await agent(`${COMMON}
担当: 執筆。SKILL.md の Step 6・8・9 を行う（comedy-craft.md §1・§5・§6、guardrails.md §3〜§5・§7 を読む）。
${BRIEF}
骨格（これに沿って書く。良くなるなら台詞は変えてよい）:
${chosen ? chosen.beat_sheet_md : '(選考失敗。事実シートから自分で骨格を作る)'}
捨てた上位案: ${chosen ? chosen.rejected_top3 : ''}
候補リスト: ${src.candidates_path}
除外ログ: ${src.rejected_log}
Step 9 の形式で ${OUT}/YYYY-MM-DD-<ascii-slug>.md に保存する。パンチアップ（Step 7）はこの後で別担当が行うので、セルフレビュー欄の「パンチアップの変更ログ」は空けておく。最後の行に「SCRIPT_PATH: <パス>」だけを書いて返す。`, { label: 'write', phase: 'Write' })
const m = String(draft || '').match(/SCRIPT_PATH:\s*(\S+)/)
const path = m ? m[1] : null
if (!path) {
  return { status: 'write_failed', topic: src.topic, draft }
}

// 4. Punch-up: cold read, then a wicked-Duke pass (sequential: both edit the same file)
phase('Punch-up')
const punch = await agent(`.claude/agents/x-parody-punchup.md を読み、その本文があなたの役割とやり方である（frontmatter は無視）。
対象台本: ${path}
「## 脚本本文」だけを冷読してからパンチアップし、ファイルを直接編集する。既存台本は ${OUT}/ にある。変更ログは台本のセルフレビュー欄に追記し、要約を返す。`, { label: 'punchup:cold', phase: 'Punch-up' })

const wicked = await agent(`${COMMON}
担当: 毒の仕上げ（2人目のパンチアップ）。対象: ${path} の「## 脚本本文」。comedy-craft.md §1（公爵の声）と §4（ダークネス）を読む。
公爵の台詞だけを見直す。高い語彙と卑近な現実の落差（M1）、架空の相手の不幸をうっとり味わう台詞（M17）、視聴者への慇懃無礼、悪役の脆さ。ダークネス ${DARK} に届いていない台詞、説明になっている台詞、言い回しが似通った台詞を書き直す（各3案から選ぶ）。ボタンとダークターンが台本で最強の2点になっているか確かめる。
触らないもの: 事実行・境界テロップ・出典・ディスクレーマー・実名の置き場所。闇の向き先は架空のキャスト・抽象概念・公爵自身だけ。ファイルを直接編集し、変更ログを同じ欄に追記して、要約を返す。`, { label: 'punchup:wicked', phase: 'Punch-up' })

// 5. Blind read: a reader who never saw the beat sheet marks real laughs; a fixer rewrites dead zones
phase('Blind read')
const blind = await agent(`あなたは日本の一般視聴者で、深夜のブラックコメディが好きだが、笑いには厳しい。元ネタのニュースはほぼ知らない。
${path} を開き、「## 脚本本文」の見出しから次の「## 」見出しの直前までだけを読む。それ以外の節（メタ情報・事実シート・裏の物語・セルフレビューなど）と★印は見ない・無視する。他のファイルも読まない。
映像を想像しながら頭から通して読み、実際に声が出た行・にやりとした行・オチが先に読めた行・意味が取れなかった行・20秒以上笑いのない区間を正直に記録する。お世辞は要らない。`, { label: 'blind:read', phase: 'Blind read', schema: BLIND })

const fixed = blind ? await agent(`${COMMON}
担当: 無風区間の修正。対象: ${path}。comedy-craft.md §1・§3・§6 を読む。
骨格を知らない読み手の反応:
${JSON.stringify(blind, null, 1)}
- dead_zones の各区間に、声が出る行を1本以上入れる（前後と違う笑いの仕組みで。各3案から選ぶ）。
- predictable の行は、オチの語を読めない方向に替えるか消す。lost の行は、絵か1語で分かるように直す（説明台詞は足さない）。
- laughs の行は触らない。
触らないもの: 事実行・境界テロップ・出典・ディスクレーマー・実名の置き場所。闇の向き先は架空のキャスト・抽象概念・公爵自身だけ。
ファイルを直接編集し、セルフレビュー欄に「### Blind read の反映」として、読み手の結果（声が出た行数・無風区間の数）と変更点を追記して、要約を返す。`, { label: 'blind:fix', phase: 'Blind read' }) : null

// 6. Safety
phase('Safety')
const safety = await agent(`${COMMON}
担当: 最終安全確認。${SK}/references/guardrails.md を読み、${path} と ${src.candidates_path} を確認する。
- §7-A をすべて点検し、「いいえ」は最小限の修正で直す。直すときは角を丸めた行を残さず、同じ位置に安全な標的（架空・公爵自身・抽象）を狙う別のボケを書き直す（comedy-craft.md §6「削っただけの安全修正」）。
- パンチアップで事実行・出典・ディスクレーマー・実名の置き場所が変わっていないか確かめる。
- 実在の人物・企業の言葉として『』で引いた語が、出典で一字一句確認できるか確かめる。
- ${OUT}/ の全ファイルを grep し、RED の人名・キーワードが無いことを確かめる。
- 公開前TODO（§7-B）を台本に反映する。
直せない違反があれば pass=false にして理由を書く。`, { label: 'safety', phase: 'Safety', schema: SAFETY })

return {
  status: safety && safety.pass ? 'ok' : 'needs_attention',
  path,
  topic: src.topic,
  triage: src.triage,
  refusal_note: src.refusal_note,
  rejected_log: src.rejected_log,
  candidates: src.candidates_path,
  premises_pitched: pool.length,
  chosen_why: chosen && chosen.why,
  punchup: punch,
  wicked,
  blind_read: blind && { laughs: blind.laughs.length, smiles: blind.smiles.length, dead_zones: blind.dead_zones },
  blind_fix: fixed,
  safety,
}
