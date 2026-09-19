import type { InterviewRoom, Problem, RoomConfigPackage } from '../types';
import { LANGUAGE_CONFIGS } from '../types';

export const ROOM_CONFIG_PACKAGE_TYPE = 'interview-room-config';
export const ROOM_CONFIG_PACKAGE_VERSION = 1;
export const DEFAULT_ROOM_LANGUAGE = 'javascript';
export const DEFAULT_ROOM_TIME_LIMIT_MINUTES = 60;
export const MIN_ROOM_TIME_LIMIT_MINUTES = 5;
export const MAX_ROOM_TIME_LIMIT_MINUTES = 480;

export interface ConfigPackageError {
  field: 'file' | 'type' | 'version' | 'title' | 'problemId' | 'language' | 'timeLimit';
  message: string;
}

export interface ConfigPackageValidation {
  /** 校验通过时的完整配置包；存在错误时为 null */
  config: RoomConfigPackage | null;
  /** 逐项列出的校验错误 */
  errors: ConfigPackageError[];
  /** 校验失败时仍可用的字段，用于预填表单便于手动修正 */
  partial: Partial<RoomConfigPackage>;
}

export const CONFIG_PACKAGE_FIELD_LABELS: Record<ConfigPackageError['field'], string> = {
  file: '文件',
  type: '配置包类型',
  version: '配置包版本',
  title: '房间标题',
  problemId: '题目标识',
  language: '编程语言',
  timeLimit: '面试时限',
};

const generatePackageId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `cfgp-${crypto.randomUUID()}`;
  }
  return `cfgp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

/** 内容指纹：配置包缺少 packageId 时用作幂等键，保证相同内容重复上传不会产生重复房间 */
const fingerprintConfig = (title: string, problemId: string, language: string, timeLimit: number): string => {
  const raw = [title, problemId, language, String(timeLimit)].join('|');
  let hash = 5381;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) + hash + raw.charCodeAt(i)) >>> 0;
  }
  return `cfgp-content-${hash.toString(16)}`;
};

export const buildRoomConfigPackage = (room: InterviewRoom): RoomConfigPackage => ({
  type: ROOM_CONFIG_PACKAGE_TYPE,
  version: ROOM_CONFIG_PACKAGE_VERSION,
  packageId: generatePackageId(),
  exportedAt: new Date().toISOString(),
  title: room.title,
  problemId: room.problemId,
  language: room.language || DEFAULT_ROOM_LANGUAGE,
  timeLimit: room.timeLimit ?? DEFAULT_ROOM_TIME_LIMIT_MINUTES,
});

export const downloadRoomConfigPackage = (room: InterviewRoom): void => {
  const pkg = buildRoomConfigPackage(room);
  const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `room-config-${room.roomCode || room.id}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const isBlank = (value: unknown): boolean =>
  value === undefined || value === null || (typeof value === 'string' && value.trim() === '');

export const validateRoomConfigPackage = (raw: unknown, problems: Problem[]): ConfigPackageValidation => {
  const errors: ConfigPackageError[] = [];
  const partial: Partial<RoomConfigPackage> = {};

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return {
      config: null,
      errors: [{ field: 'file', message: '文件格式错误：配置包必须是一个 JSON 对象' }],
      partial,
    };
  }

  const pkg = raw as Record<string, unknown>;

  if (isBlank(pkg.type)) {
    errors.push({ field: 'type', message: `缺少字段 type（配置包类型），应为 "${ROOM_CONFIG_PACKAGE_TYPE}"` });
  } else if (pkg.type !== ROOM_CONFIG_PACKAGE_TYPE) {
    errors.push({ field: 'type', message: `格式错误：type 应为 "${ROOM_CONFIG_PACKAGE_TYPE}"，当前为 "${String(pkg.type)}"` });
  }

  if (pkg.version !== undefined && pkg.version !== ROOM_CONFIG_PACKAGE_VERSION) {
    errors.push({ field: 'version', message: `不支持的配置包版本：${String(pkg.version)}，当前支持版本 ${ROOM_CONFIG_PACKAGE_VERSION}` });
  }

  if (isBlank(pkg.title)) {
    errors.push({ field: 'title', message: '缺少字段 title（房间标题）' });
  } else if (typeof pkg.title !== 'string') {
    errors.push({ field: 'title', message: '格式错误：title 应为非空字符串' });
  } else {
    partial.title = pkg.title.trim();
  }

  if (isBlank(pkg.problemId)) {
    errors.push({ field: 'problemId', message: '缺少字段 problemId（题目标识）' });
  } else if (typeof pkg.problemId !== 'string') {
    errors.push({ field: 'problemId', message: '格式错误：problemId 应为非空字符串' });
  } else {
    const problem = problems.find(p => p.id === pkg.problemId);
    if (!problem) {
      errors.push({ field: 'problemId', message: `题目不存在：题库中找不到 ID 为 "${pkg.problemId}" 的题目` });
    } else {
      partial.problemId = problem.id;
    }
  }

  const validLanguages = LANGUAGE_CONFIGS.map(l => l.value);
  if (isBlank(pkg.language)) {
    errors.push({ field: 'language', message: '缺少字段 language（编程语言）' });
  } else if (typeof pkg.language !== 'string' || !validLanguages.includes(pkg.language)) {
    errors.push({ field: 'language', message: `格式错误：language 应为 ${validLanguages.join(' / ')} 之一` });
  } else {
    partial.language = pkg.language;
  }

  if (pkg.timeLimit === undefined || pkg.timeLimit === null || pkg.timeLimit === '') {
    errors.push({ field: 'timeLimit', message: '缺少字段 timeLimit（面试时限）' });
  } else if (
    typeof pkg.timeLimit !== 'number' ||
    !Number.isInteger(pkg.timeLimit) ||
    pkg.timeLimit < MIN_ROOM_TIME_LIMIT_MINUTES ||
    pkg.timeLimit > MAX_ROOM_TIME_LIMIT_MINUTES
  ) {
    errors.push({ field: 'timeLimit', message: `格式错误：timeLimit 应为 ${MIN_ROOM_TIME_LIMIT_MINUTES}-${MAX_ROOM_TIME_LIMIT_MINUTES} 之间的整数（分钟）` });
  } else {
    partial.timeLimit = pkg.timeLimit;
  }

  if (errors.length > 0) {
    return { config: null, errors, partial };
  }

  const config: RoomConfigPackage = {
    type: ROOM_CONFIG_PACKAGE_TYPE,
    version: ROOM_CONFIG_PACKAGE_VERSION,
    packageId: typeof pkg.packageId === 'string' && pkg.packageId.trim() !== ''
      ? pkg.packageId.trim()
      : fingerprintConfig(partial.title!, partial.problemId!, partial.language!, partial.timeLimit!),
    exportedAt: typeof pkg.exportedAt === 'string' ? pkg.exportedAt : new Date().toISOString(),
    title: partial.title!,
    problemId: partial.problemId!,
    language: partial.language!,
    timeLimit: partial.timeLimit!,
  };

  return { config, errors: [], partial };
};
