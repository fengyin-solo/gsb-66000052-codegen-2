import type { Problem } from '../types';
import { LANGUAGE_CONFIGS } from '../types';

export const ROOM_CONFIG_PACKAGE_VERSION = 1;
export const DEFAULT_ROOM_LANGUAGE = 'javascript';
export const DEFAULT_ROOM_TIME_LIMIT = 60;
export const MIN_ROOM_TIME_LIMIT = 5;
export const MAX_ROOM_TIME_LIMIT = 480;

/** 面试房间配置包：用于在房间之间迁移「标题 / 题目标识 / 语言 / 时限」配置 */
export interface RoomConfigPackage {
  version: number;
  title: string;
  problemId: string;
  language: string;
  timeLimit: number;
}

export type RoomConfigFieldKey = 'file' | 'title' | 'problemId' | 'language' | 'timeLimit';

export interface RoomConfigFieldError {
  field: RoomConfigFieldKey;
  label: string;
  message: string;
}

export const ROOM_CONFIG_FIELD_LABELS: Record<Exclude<RoomConfigFieldKey, 'file'>, string> = {
  title: '房间标题',
  problemId: '题目标识',
  language: '编程语言',
  timeLimit: '面试时限',
};

export interface RoomConfigParseResult {
  config: RoomConfigPackage | null;
  errors: RoomConfigFieldError[];
}

export const buildRoomConfigPackage = (source: {
  title: string;
  problemId: string;
  language?: string;
  timeLimit?: number;
}): RoomConfigPackage => ({
  version: ROOM_CONFIG_PACKAGE_VERSION,
  title: source.title,
  problemId: source.problemId,
  language: source.language || DEFAULT_ROOM_LANGUAGE,
  timeLimit: source.timeLimit ?? DEFAULT_ROOM_TIME_LIMIT,
});

const sanitizeFileName = (name: string): string => {
  const cleaned = name.replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned.slice(0, 50) || 'room';
};

export const downloadRoomConfigPackage = (pkg: RoomConfigPackage, nameHint?: string): void => {
  const fileName = `interview-room-config-${sanitizeFileName(nameHint || pkg.title)}.json`;
  const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseTimeLimitValue = (raw: unknown): number | null => {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null;
  }
  if (typeof raw === 'string' && /^\d+(\.\d+)?$/.test(raw.trim())) {
    return Number(raw.trim());
  }
  return null;
};

/**
 * 解析并逐项校验配置包内容。
 * 缺字段、格式错误、题目不存在等问题会按字段逐项返回，便于用户修正后重新上传。
 */
export const parseRoomConfigPackage = (text: string, problems: Problem[]): RoomConfigParseResult => {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return {
      config: null,
      errors: [{ field: 'file', label: '文件格式', message: '文件不是有效的 JSON，请检查文件内容后重新上传' }],
    };
  }

  if (!isPlainObject(raw)) {
    return {
      config: null,
      errors: [{ field: 'file', label: '文件格式', message: '配置包必须是 JSON 对象，且包含 title / problemId / language / timeLimit 字段' }],
    };
  }

  const errors: RoomConfigFieldError[] = [];
  const labels = ROOM_CONFIG_FIELD_LABELS;

  // 房间标题
  let title = '';
  if (raw.title === undefined || raw.title === null) {
    errors.push({ field: 'title', label: labels.title, message: '缺少必填字段 title（房间标题）' });
  } else if (typeof raw.title !== 'string' || raw.title.trim() === '') {
    errors.push({ field: 'title', label: labels.title, message: '房间标题必须是非空字符串' });
  } else if (raw.title.trim().length > 100) {
    errors.push({ field: 'title', label: labels.title, message: '房间标题过长（最多 100 个字符）' });
  } else {
    title = raw.title.trim();
  }

  // 题目标识
  let problemId = '';
  if (raw.problemId === undefined || raw.problemId === null) {
    errors.push({ field: 'problemId', label: labels.problemId, message: '缺少必填字段 problemId（题目标识）' });
  } else if (typeof raw.problemId !== 'string' || raw.problemId.trim() === '') {
    errors.push({ field: 'problemId', label: labels.problemId, message: '题目标识必须是非空字符串' });
  } else {
    problemId = raw.problemId.trim();
    if (!problems.some(p => p.id === problemId)) {
      errors.push({ field: 'problemId', label: labels.problemId, message: `题目不存在：${problemId}，请核对题库中的题目标识` });
    }
  }

  // 编程语言
  let language = '';
  const supportedLanguages = LANGUAGE_CONFIGS.map(l => l.value).join(' / ');
  if (raw.language === undefined || raw.language === null) {
    errors.push({ field: 'language', label: labels.language, message: '缺少必填字段 language（编程语言）' });
  } else if (typeof raw.language !== 'string' || !LANGUAGE_CONFIGS.some(l => l.value === raw.language)) {
    errors.push({ field: 'language', label: labels.language, message: `不支持的编程语言：${String(raw.language)}（可选：${supportedLanguages}）` });
  } else {
    language = raw.language;
  }

  // 面试时限（分钟）
  let timeLimit = 0;
  if (raw.timeLimit === undefined || raw.timeLimit === null) {
    errors.push({ field: 'timeLimit', label: labels.timeLimit, message: '缺少必填字段 timeLimit（面试时限，单位：分钟）' });
  } else {
    const parsed = parseTimeLimitValue(raw.timeLimit);
    if (parsed === null || !Number.isInteger(parsed)) {
      errors.push({ field: 'timeLimit', label: labels.timeLimit, message: '面试时限必须是整数（单位：分钟）' });
    } else if (parsed < MIN_ROOM_TIME_LIMIT || parsed > MAX_ROOM_TIME_LIMIT) {
      errors.push({ field: 'timeLimit', label: labels.timeLimit, message: `面试时限需在 ${MIN_ROOM_TIME_LIMIT} ~ ${MAX_ROOM_TIME_LIMIT} 分钟之间` });
    } else {
      timeLimit = parsed;
    }
  }

  if (errors.length > 0) {
    return { config: null, errors };
  }
  return {
    config: { version: ROOM_CONFIG_PACKAGE_VERSION, title, problemId, language, timeLimit },
    errors: [],
  };
};

/** FNV-1a 哈希，用于从配置内容生成稳定的幂等键 */
const fnv1aHash = (str: string): string => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

/**
 * 基于配置包内容生成幂等键：同一配置包重复上传、重复提交时键相同，
 * 后端据此返回已创建的房间而不是生成重复房间。
 */
export const computeConfigPackageKey = (config: RoomConfigPackage): string => {
  const canonical = JSON.stringify([config.title, config.problemId, config.language, config.timeLimit]);
  return `cfg-${fnv1aHash(canonical)}`;
};

/** 手工创建流程使用的随机会话键：防止重复点击/重试产生重复房间 */
export const generateClientRequestId = (): string =>
  `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
