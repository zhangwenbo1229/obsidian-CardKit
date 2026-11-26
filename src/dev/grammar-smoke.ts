/**
 * Grammar smoke test.
 *
 * Runs the pure parser over hand written fixtures so the block grammar is
 * verified without an Obsidian window. Bundled and executed by
 * scripts/smoke.sh; not reachable from src/main.ts, so it never ships.
 */
import { splitCardBlock } from '../core/block-splitter';
import { parseCardTypes, stringifyCardTypes, validateCardTypes } from '../core/card-types';
import { formatBody, splitHighlights } from '../core/body-format';
import { buildCardBlock } from '../core/card-block';
import { parseEndpoints } from '../core/endpoint-parser';
import { filterHeaderItems, suggestHeaderItems } from '../core/header-suggest';
import { parseCardHeader, parseNoteShorthand } from '../core/header-parser';
import { parseLegacyPayload } from '../core/legacy-parser';
import { buildCardSkeleton } from '../core/skeleton';
import { coerceVariables, findPlaceholders, substituteVariables } from '../core/variables';
import { applyBlockInner, fenceLanguage, findFenceAtCursor, formatCardBlock } from '../core/write-ops';

let checks = 0;

function check(label: string, condition: boolean): void {
	checks += 1;
	if (!condition) {
		throw new Error('语法冒烟失败：' + label);
	}
}

function must<T>(value: T | null | undefined, label: string): T {
	if (value === null || value === undefined) {
		throw new Error('语法冒烟失败（缺少值）：' + label);
	}
	return value;
}

const BARE = 'nmap -v 127.0.0.1';

const HEADERED = [
	'---',
	'step: 1',
	'title: 示例卡片',
	'scope: linux',
	'language: bash',
	'tags: [jwt, 认证]',
	'notes:',
	'  - kind: 参数',
	'    token: -v',
	'    note: 详细输出',
	'  - 简写 | -x | X 开关',
	'unknown-key: 留给自定义类型',
	'---',
	'# 这一行是代码里的注释，不是标题',
	'echo hi',
].join('\n');

const UNCLOSED = ['---', 'title: 缺少结束围栏', 'echo hi'].join('\n');

const BODY_WITH_FENCE = ['---', 'title: 正文含分隔线', '---', 'a', '---', 'b'].join('\n');

// A block without a header is all body: legacy payload blocks keep working.
const bare = splitCardBlock(BARE);
check('裸块没有包头', bare.hasHeader === false);
check('裸块正文完好', bare.bodyText === BARE);

// Format A: header between the two fences, body verbatim after the second one.
const split = splitCardBlock(HEADERED);
check('识别包头', split.hasHeader === true);
check('包头文本包含 step', (split.headerText ?? '').includes('step: 1'));
check('正文从第二个围栏之后开始', split.bodyText.startsWith('# 这一行是代码里的注释'));
check('正文保留代码注释行', split.bodyText.includes('echo hi'));

const parsed = parseCardHeader(must(split.headerText, 'headerText'));
check('step 解析', parsed.header.step === '1');
check('title 解析', parsed.header.title === '示例卡片');
check('scope 解析', parsed.header.scope === 'linux');
check('language 解析', parsed.header.language === 'bash');
check('tags 行内列表', parsed.header.tags.join(',') === 'jwt,认证');
check('notes 条数', parsed.header.notes.length === 2);
const firstNote = must(parsed.header.notes[0], 'notes[0]');
check('notes 映射式 kind', firstNote.kind === '参数');
check('notes 映射式 token', firstNote.token === '-v');
check('notes 映射式 note', firstNote.note === '详细输出');
const secondNote = must(parsed.header.notes[1], 'notes[1]');
check('notes 简写 kind', secondNote.kind === '简写');
check('notes 简写 token', secondNote.token === '-x');
check('notes 简写 note', secondNote.note === 'X 开关');
check('未知键进入 extra', parsed.header.extra.get('unknown-key') === '留给自定义类型');
check('解析无问题', parsed.problems.length === 0);

// An unclosed header must not swallow the block.
const unclosed = splitCardBlock(UNCLOSED);
check('未闭合包头不当包头', unclosed.hasHeader === false);
check('未闭合包头有提示', unclosed.problems.length === 1);
check('未闭合包头正文保留', unclosed.bodyText.includes('echo hi'));

// Body keeps its own --- lines.
const fenced = splitCardBlock(BODY_WITH_FENCE);
check('正文中的 --- 保留', fenced.bodyText === 'a\n---\nb');

// Aliases.
const aliased = parseCardHeader(['platform: Windows', 'lang: powershell', 'desc: 说明'].join('\n'));
check('platform 别名', aliased.header.scope === 'Windows');
check('lang 别名', aliased.header.language === 'powershell');
check('desc 别名', aliased.header.description === '说明');

// Problems are reported, never swallowed.
const bad = parseCardHeader(['not a key value line', 'notes: 行内写法'].join('\n'));
check('无法解析的行有提示', bad.problems.length === 2);

// Custom card types: the settings JSON in, validated definitions out.
const goodJson = JSON.stringify({
	types: [
		{ id: 'apicall', name: '接口调用', aliases: ['api'], defaults: { language: 'bash', scope: 'web' } },
		{ id: 'sqlcard' },
	],
});
const parsedTypes = parseCardTypes(goodJson);
check('自定义类型条数', parsedTypes.types.length === 2);
check('自定义类型无问题', parsedTypes.problems.length === 0);
const apiType = must(parsedTypes.types[0], 'types[0]');
check('自定义类型别名', apiType.aliases.join(',') === 'api');
check('自定义类型默认字段', apiType.defaults.language === 'bash');
check('缺省 name 回退成 id', must(parsedTypes.types[1], 'types[1]').name === 'sqlcard');

check('空文本框视为清空', parseCardTypes('   ').types.length === 0);
check('非法 JSON 有提示', parseCardTypes('{oops').problems.length === 1);
check('顶层必须是数组或带 types 的对象', validateCardTypes({ nope: 1 }).problems.length === 1);
check('缺少 id 有提示', parseCardTypes('[{}]').problems.length === 1);
check('内建块名被拒绝', parseCardTypes('[{"id":"card"}]').problems.length === 1);
check('重复 id 有提示', parseCardTypes('[{"id":"a"},{"id":"a"}]').problems.length === 1);
check('别名撞 id 有提示', parseCardTypes('[{"id":"a","aliases":["b"]},{"id":"b"}]').problems.length === 1);
check('别名格式错误有提示', parseCardTypes('[{"id":"a","aliases":["Bad Alias"]}]').problems.length === 1);
check('defaults 未知字段有提示', parseCardTypes('[{"id":"a","defaults":{"color":"red"}}]').problems.length === 1);

const roundTrip = parseCardTypes(stringifyCardTypes(parsedTypes.types));
check('导出可原样导入', roundTrip.problems.length === 0 && roundTrip.types.length === 2);
check('导出保留默认字段', must(roundTrip.types[0], 'roundTrip[0]').defaults.scope === 'web');

// --- v1 payload micro syntax (the 1.x grammar, kept for existing notes) ---

// The jwt-none-alg regression: the second "# " line is body text, not a title.
const jwt = [
	'# 1. 解码JWT',
	'> 解码JWT令牌',
	'@ all',
	'? value | HEADER | JWT头部，包含算法信息',
	'? value | PAYLOAD | JWT载荷，包含用户数据',
	'',
	'# 在线解码',
	'https://jwt.io',
	'',
	'# 使用命令行',
	'echo "HEADER" | base64 -d',
].join('\n');
const jwtParsed = parseLegacyPayload(jwt);
check('v1 识别到元信息', jwtParsed.hasMeta === true);
check('v1 标题不被正文 # 覆盖', jwtParsed.header.title === '1. 解码JWT');
check('v1 scope', jwtParsed.header.scope === 'all');
check('v1 注解条数', jwtParsed.header.notes.length === 2);
const jwtNote = must(jwtParsed.header.notes[0], 'jwt note');
check('v1 注解 kind', jwtNote.kind === 'value');
check('v1 注解 token', jwtNote.token === 'HEADER');
check('v1 注解 note', jwtNote.note === 'JWT头部，包含算法信息');
check('v1 正文包含第二个标题', jwtParsed.body.startsWith('# 在线解码'));
check('v1 正文保留命令', jwtParsed.body.includes('echo "HEADER" | base64 -d'));
check('v1 没有解析问题', jwtParsed.problems.length === 0);

// winpeas sample: meta, blank line, then a single command.
const winpeas = ['# 全量扫描', '> 执行所有Windows提权检查', '@ Windows', '', 'winpeasany.exe'].join('\n');
const winpeasParsed = parseLegacyPayload(winpeas);
check('v1 标题', winpeasParsed.header.title === '全量扫描');
check('v1 描述', winpeasParsed.header.description === '执行所有Windows提权检查');
check('v1 Windows scope', winpeasParsed.header.scope === 'Windows');
check('v1 正文', winpeasParsed.body === 'winpeasany.exe');

// No blank line between meta and code: the first unknown line ends the meta region.
const tight = ['# 标题', '> 描述', '@ Linux', 'cmd --flag'].join('\n');
const tightParsed = parseLegacyPayload(tight);
check('v1 无空行也能切分', tightParsed.body === 'cmd --flag' && tightParsed.header.title === '标题');

// Step, language and multi-line description.
const full = ['[1]', '# 标题', '$ bash', '> 第一行', '> 第二行', 'echo hi'].join('\n');
const fullParsed = parseLegacyPayload(full);
check('v1 步骤', fullParsed.header.step === '1');
check('v1 语言', fullParsed.header.language === 'bash');
check('v1 多行描述', fullParsed.header.description === '第一行\n第二行');
check('v1 多行描述后的正文', fullParsed.body === 'echo hi');

// A second title line ends the meta region instead of replacing the title.
const twoTitles = ['# 标题', '# 注释', 'code'].join('\n');
const twoTitlesParsed = parseLegacyPayload(twoTitles);
check('v1 第二个标题归正文', twoTitlesParsed.header.title === '标题' && twoTitlesParsed.body === '# 注释\ncode');

// Pure code must stay pure code: "@echo off" is not an "@ " marker.
const batch = ['@echo off', 'whoami'].join('\n');
const batchParsed = parseLegacyPayload(batch);
check('v1 纯代码没有元信息', batchParsed.hasMeta === false);
check('v1 纯代码原样保留', batchParsed.body === batch);

// The block pipeline picks the grammar by fence language.
const viaPipeline = buildCardBlock('payload', winpeas, []);
check('pipeline 走 v1 语法', viaPipeline.syntax === 'legacy');
check('pipeline 带出标题', viaPipeline.header.title === '全量扫描');
const cardPlain = buildCardBlock('card', ['# 注释', 'echo hi'].join('\n'), []);
check('card 无包头不解释微语法', cardPlain.syntax === 'plain' && cardPlain.header.title === null);
check('card 无包头正文原样', cardPlain.body === '# 注释\necho hi');
const yamlOnPayload = buildCardBlock('payload', ['---', 'title: 新语法', '---', 'cmd'].join('\n'), []);
check('payload 带包头走 yaml', yamlOnPayload.syntax === 'yaml' && yamlOnPayload.header.title === '新语法');

// --- global variables ---

const vars = [
	{ key: 'ip', value: '10.0.0.1' },
	{ key: '{{port}}', value: '4444' },
];
check('变量替换', substituteVariables('nc {{ip}} {{port}}', vars) === 'nc 10.0.0.1 4444');
check('未配置的占位符原样保留', substituteVariables('{{nope}} {{ip}}', vars) === '{{nope}} 10.0.0.1');
check('空变量表不改动文本', substituteVariables('{{ip}}', []) === '{{ip}}');
check('空 key 不参与替换', substituteVariables('{{}}', [{ key: '', value: 'x' }]) === '{{}}');
check('占位符探测', findPlaceholders('a {{ip}} b', vars).join(',') === '{{ip}}');
check('变量表校验丢坏值', coerceVariables([{ key: 'ok', value: '1' }, { value: 'x' }, 'nope']).length === 1);

// --- M3: problem lines, typo hints, empty values ---

const badHeader = ['title: 好的', 'titel: 打错的键', 'scope:', '这行没有冒号'].join('\n');
const parsedBad = parseCardHeader(badHeader);
check('问题条数', parsedBad.problems.length === 3);
check('第一处问题在第 2 行', must(parsedBad.problems[0], 'p0').line === 1);
check('第二处问题在第 3 行', must(parsedBad.problems[1], 'p1').line === 2);
check('第三处问题在第 4 行', must(parsedBad.problems[2], 'p2').line === 3);
check('拼写提示指向 title', must(parsedBad.problems[0], 'p0').message.includes('title'));
check('空值有提示', must(parsedBad.problems[1], 'p1').message.includes('没有值'));
check('无法解析的行有提示', must(parsedBad.problems[2], 'p2').message.includes('无法解析'));

const unknownKey = parseCardHeader(['自定义字段: 值'].join('\n'));
check('陌生字段保留在 extra', unknownKey.header.extra.get('自定义字段') === '值');
check('陌生字段不打扰用户', unknownKey.problems.length === 0);

// Header problems are reported in block coordinates (the header sits between fences).
const viaBlock = buildCardBlock('card', ['---', 'titel: x', '---', 'cmd'].join('\n'), []);
check('包头问题换算到块行号', must(viaBlock.problems[0], 'p').line === 1);

// The v1 parser numbers its own problems in block coordinates too.
const legacyBad = parseLegacyPayload(['# 标题', '? 没有分隔符'].join('\n'));
check('v1 注解问题带行号', must(legacyBad.problems[0], 'p').line === 1);

// Note shorthand trimming keeps a note that itself contains "|".
const pipeNote = parseNoteShorthand('tag | <script> | HTML标签/事件处理器');
check('注解含竖线不串列', pipeNote.kind === 'tag' && pipeNote.token === '<script>' && pipeNote.note === 'HTML标签/事件处理器');

// --- M4: type options, skeleton and the insert command pieces ---

const typed = parseCardTypes(
	JSON.stringify([
		{
			id: 'apicall',
			name: '接口调用',
			aliases: ['api'],
			defaults: { language: 'bash' },
			options: { notes: false, copy: false },
			skeleton: 'curl -s https://example.com',
		},
		{ id: 'plaintype' },
	]),
);
const apiTyped = must(typed.types[0], 'typed[0]');
const plainTyped = must(typed.types[1], 'typed[1]');
check('options 读入', apiTyped.options.notes === false && apiTyped.options.copy === false);
check('options 缺省为 true', plainTyped.options.notes === true && plainTyped.options.copy === true);
check('skeleton 读入', apiTyped.skeleton === 'curl -s https://example.com');
check('skeleton 缺省为空', plainTyped.skeleton === '');
check('options 未知字段有提示', parseCardTypes('[{"id":"a","options":{"colour":true}}]').problems.length === 1);
check('skeleton 含围栏被拒绝', parseCardTypes('[{"id":"a","skeleton":"```"}]').problems.length === 1);

const optionsRoundTrip = parseCardTypes(stringifyCardTypes(typed.types));
check('options 往返', must(optionsRoundTrip.types[0], 'rt0').options.notes === false);
check('skeleton 往返', must(optionsRoundTrip.types[0], 'rt0').skeleton === 'curl -s https://example.com');

// buildCardBlock resolves the owning type's options and defaults.
const withType = buildCardBlock('apicall', ['---', 'title: x', '---', 'cmd'].join('\n'), typed.types);
check('块带出类型 options', withType.options.notes === false && withType.options.copy === false);
check('块带出类型默认字段', withType.header.language === 'bash');
const withAlias = buildCardBlock('api', ['---', 'title: x', '---', 'cmd'].join('\n'), typed.types);
check('别名同样带出 options', withAlias.options.notes === false);
const plainBlock = buildCardBlock('card', 'echo hi', typed.types);
check('内建类型用默认 options', plainBlock.options.notes === true && plainBlock.options.copy === true);

// Skeleton: text shape, cursor target and when defaults are written out.
const skeleton = buildCardSkeleton('card', null);
check('骨架头两行', skeleton.text.startsWith('```card\n---\ntitle: '));
check('骨架标题位置', skeleton.titleLine === 2 && skeleton.titleStart === 7 && skeleton.titleLength === 3);
check('骨架结尾', skeleton.text.endsWith('正文写在这里\n```\n'));
check('骨架不写空字段', !skeleton.text.includes('scope:') && !skeleton.text.includes('language:'));
const customSkeleton = buildCardSkeleton('apicall', apiTyped);
check('骨架带默认字段', customSkeleton.text.includes('language: bash'));
check('骨架用自定义正文', customSkeleton.text.includes('curl -s https://example.com'));

// --- M5: write back core (all pure) ---

const noteText = ['# 标题', '', '```card', '---', 'title: 原', '---', 'old body', '```', '', '尾巴'].join('\n');
const applied = applyBlockInner(
	noteText,
	{ startLine: 2, endLine: 7 },
	'---\ntitle: 原\n---\nold body',
	'---\ntitle: 新\n---\nnew body',
);
check('写入成功', applied.ok === true);
if (applied.ok) {
	check('围栏保留', applied.text.includes('```card\n---\ntitle: 新\n---\nnew body\n```'));
	check('上下文不受影响', applied.text.startsWith('# 标题') && applied.text.endsWith('尾巴'));
}
check('冲突时拒绝写入', applyBlockInner(noteText, { startLine: 2, endLine: 7 }, '别的内容', 'x').ok === false);
check('范围倒置被拒', applyBlockInner(noteText, { startLine: 7, endLine: 2 }, '', 'x').ok === false);
check('非围栏行被拒', applyBlockInner(noteText, { startLine: 0, endLine: 7 }, '', 'x').ok === false);
const crlfApplied = applyBlockInner('a\r\n```card\r\nold\r\n```\r\nb', { startLine: 1, endLine: 3 }, 'old', 'new');
check('保留 CRLF', crlfApplied.ok === true && crlfApplied.text.includes('\r\nnew\r\n') && crlfApplied.text.endsWith('b'));

// Locating the block under the cursor
const buffer = ['前言', '```card', '---', 'title: x', '---', 'body', '```', '后记', '```payload', 'cmd', '```'].join('\n');
const atBody = findFenceAtCursor(buffer, 5);
check('光标定位到卡片块', atBody !== null && atBody.startLine === 1 && atBody.endLine === 6);
check('块内文本正确', atBody !== null && atBody.inner.startsWith('---'));
check('光标在块外返回空', findFenceAtCursor(buffer, 7) === null);
check('围栏语言提取', fenceLanguage('```card') === 'card' && fenceLanguage('```  PAYLOAD  ') === 'payload');

// Formatting: canonical order, trimmed body, idempotent
const messy = ['---', 'tags: [b, a]', 'title:   带空格的标题   ', 'language: bash', '---', '', 'body   ', '', ''].join('\n');
const formatted = formatCardBlock(buildCardBlock('card', messy, []));
check('字段顺序规整', formatted.startsWith('---\ntitle: 带空格的标题\nlanguage: bash\ntags: [b, a]\n---\n'));
check('正文尾部空白清除', formatted.endsWith('\nbody'));
check('规整是幂等的', formatCardBlock(buildCardBlock('card', formatted, [])) === formatted);

// A v1 block keeps its micro syntax; only the body edges are tidied.
const legacyMessy = ['# 标题', '> 描述', '', 'cmd   ', '', ''].join('\n');
const legacyFormatted = formatCardBlock(buildCardBlock('payload', legacyMessy, []));
check('v1 块保留微语法', legacyFormatted.startsWith('# 标题\n> 描述\n\ncmd'));
check('v1 块不会被改成 YAML', !legacyFormatted.includes('---'));

// --- M9: endpoint cards (pure parsing and body formatting) ---

const endpointJson = JSON.stringify([
	{
		method: 'post',
		endpoint: '/api/login',
		condition: '填表 -> 提交 -> 拿 token',
		examples: [
			{
				requestBody: { user: 'admin', pass: 'x' },
				responseBody: '{"token":"abc"}',
				requestMetadata: ['application/json', { text: '需要登录', color: '#f00' }],
				responseHighlights: [{ line: 1, start: 0, end: 5, color: '#ff0' }],
			},
		],
	},
]);
const parsedApi = parseEndpoints(endpointJson);
check('端点条数', parsedApi.endpoints.length === 1);
check('端点无问题', parsedApi.problems.length === 0);
const firstEndpoint = must(parsedApi.endpoints[0], 'ep0');
check('方法转大写', firstEndpoint.method === 'POST');
check('接口地址', firstEndpoint.endpoint === '/api/login');
check('调用条件', firstEndpoint.condition === '填表 -> 提交 -> 拿 token');
const firstExample = must(firstEndpoint.examples[0], 'example0');
check('对象请求体被序列化', firstExample.requestBody.includes('"user": "admin"'));
check('字符串响应体原样', firstExample.responseBody === '{"token":"abc"}');
check('metadata 两种写法', firstExample.requestMetadata.length === 2);
check('metadata 颜色', firstExample.requestMetadata[1]?.color === '#f00');
check('高亮解析', firstExample.responseHighlights[0]?.end === 5);

const handWritten = parseEndpoints('{"method":"GET","endpoint":"/a","responseBody":"ok"}');
check('无 examples 时回落顶层字段', handWritten.endpoints[0]?.examples.length === 1);
const longBadJson = parseEndpoints('{\n  "a": 1,\n  "b": 2,\n  "c": }').problems[0];
check('长 JSON 出错能定位到行', must(longBadJson, 'p').line !== null);
check('短 JSON 出错也不报假行号', parseEndpoints('{"a": }').problems[0]?.line !== undefined);
check('顶层形状错误无行号', must(parseEndpoints('123').problems[0], 'p').line === null);
check('缺少 endpoint 有提示', parseEndpoints('[{"method":"GET"}]').problems.length === 1);
check(
	'坏高亮被拒绝',
	parseEndpoints('[{"endpoint":"/a","examples":[{"responseBody":"x","responseHighlights":[{"line":0,"start":3,"end":1}]}]}]').problems.length === 1,
);
check('空块有提示', parseEndpoints('   ').problems.length === 1);

// Body formatting
check('JSON 美化', formatBody('{"a":1,"b":[2,3]}', 'application/json').text.includes('\n  "a": 1'));
check('按内容猜 JSON', formatBody('{"a":1}', '').language === 'json');
check('XML 换行', formatBody('<a><b/></a>', 'application/xml').text === '<a>\n<b/>\n</a>');
check('纯文本回落', formatBody('hello', '').language === 'plaintext');
check('坏 JSON 原样返回', formatBody('{oops', 'application/json').text === '{oops');

// Highlight segmentation
const segments = splitHighlights('hello world', [{ line: 0, start: 6, end: 11, color: '#ff0' }]);
check('高亮切两段（前文 + 高亮）', segments.length === 2);
check('高亮拼回原文', segments.map((part) => part.text).join('') === 'hello world');
check('高亮着色', segments[1]?.color === '#ff0');
const clipped = splitHighlights('ab', [{ line: 0, start: 1, end: 99, color: '' }]);
check('越界高亮被裁剪', clipped.map((part) => part.text).join('') === 'ab');
const overlapping = splitHighlights('abcdef', [
	{ line: 0, start: 0, end: 4, color: '#a' },
	{ line: 0, start: 2, end: 6, color: '#b' },
]);
check('重叠高亮不重复文本', overlapping.map((part) => part.text).join('') === 'abcdef');
check('多行高亮带换行', splitHighlights('a\nb', [{ line: 1, start: 0, end: 1, color: '#f00' }]).map((part) => part.text).join('') === 'a\nb');

// --- M8: header completion (pure candidate list) ---

const keySuggest = must(suggestHeaderItems([], 'ti', 2), 'keys');
check('补全键名', keySuggest.items.some((item) => item.label === 'title' && item.insert === 'title: '));
check('补全查询与替换位置', keySuggest.query === 'ti' && keySuggest.replaceFrom === 0);
const usedKeySuggest = must(suggestHeaderItems(['title: x'], '', 0), 'used');
check('已写的键不再提示', !usedKeySuggest.items.some((item) => item.label === 'title'));
check('未写的键仍然提示', usedKeySuggest.items.some((item) => item.label === 'scope'));

const scopeSuggest = must(suggestHeaderItems(['title: x'], 'scope: w', 8), 'scope');
check('scope 取值补全', scopeSuggest.items.some((item) => item.insert === 'scope: Windows'));
const langSuggest = must(suggestHeaderItems([], 'language: py', 12), 'lang');
check('language 取值补全', langSuggest.items.some((item) => item.insert === 'language: python'));
check('缩进行按内容起点替换', must(suggestHeaderItems([], '  scope: a', 10), 'indent').replaceFrom === 2);

const noteFieldsSuggest = must(suggestHeaderItems(['notes:'], '- ', 2), 'note-fields');
check('注解字段补全', noteFieldsSuggest.items.map((item) => item.label).join(',') === 'kind,token,note');
const noteKindSuggest = must(suggestHeaderItems(['notes:', '- kind: x'], '  - kind: 参', 11), 'note-kind');
check('注解类型补全', noteKindSuggest.items.some((item) => item.insert === 'kind: 参数'));
check('自由文本不补全', suggestHeaderItems([], 'token: -v', 9) === null);
check('不认识的键不补全', suggestHeaderItems([], 'foo: bar', 8) === null);

const filteredKeys = filterHeaderItems(must(suggestHeaderItems([], 's', 1), 'f').items, 's');
check('键名按前缀过滤', filteredKeys.length > 0 && filteredKeys.every((item) => item.label.startsWith('s')));
const unfilteredValues = filterHeaderItems(must(suggestHeaderItems([], 'scope: w', 8), 'f').items, 'scope: w');
check('取值不做前缀过滤', unfilteredValues.length > 3);

console.warn('语法冒烟通过：' + String(checks) + ' 项检查');