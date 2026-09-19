import React, { useState, useEffect, useRef } from 'react';
import { createRoom } from '../services/interviewRoomService';
import { getProblems } from '../services/problemService';
import type { InterviewRoom, CreateRoomRequest, CreateRoomResponse, User, Problem } from '../types';
import { DIFFICULTY_TAGS, getDifficultyTag, LANGUAGE_CONFIGS } from '../types';
import { useInterviewStore } from '../store/interview';
import { useToastStore } from '../store/toast';
import {
  buildRoomConfigPackage,
  computeConfigPackageKey,
  downloadRoomConfigPackage,
  generateClientRequestId,
  parseRoomConfigPackage,
  DEFAULT_ROOM_LANGUAGE,
  DEFAULT_ROOM_TIME_LIMIT,
  MIN_ROOM_TIME_LIMIT,
  MAX_ROOM_TIME_LIMIT,
} from '../utils/roomConfigPackage';
import type { RoomConfigPackage, RoomConfigFieldError } from '../utils/roomConfigPackage';

interface CreateRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (room: InterviewRoom) => void;
}

export const CreateRoomModal: React.FC<CreateRoomModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { currentUser, setMyRooms, myRooms, setCurrentUser, problems, setProblems } = useInterviewStore();
  const { error: showError, info, success } = useToastStore();
  const [title, setTitle] = useState('');
  const [problemId, setProblemId] = useState('');
  const [interviewerName, setInterviewerName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [problemsLoading, setProblemsLoading] = useState(false);
  const [difficultyFilter, setDifficultyFilter] = useState<string>('all');
  const [problemSearch, setProblemSearch] = useState('');
  const [selectedProblem, setSelectedProblem] = useState<Problem | null>(null);
  const [showProblemList, setShowProblemList] = useState(false);
  const [language, setLanguage] = useState(DEFAULT_ROOM_LANGUAGE);
  const [timeLimit, setTimeLimit] = useState<number>(DEFAULT_ROOM_TIME_LIMIT);
  const [clientRequestId, setClientRequestId] = useState<string>(() => generateClientRequestId());
  const [appliedConfig, setAppliedConfig] = useState<RoomConfigPackage | null>(null);
  const [configErrors, setConfigErrors] = useState<RoomConfigFieldError[] | null>(null);
  const [configFileName, setConfigFileName] = useState('');
  const [configParsing, setConfigParsing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      // 每次打开都是一次新的创建会话：重置配置包状态并生成新的幂等键
      setClientRequestId(generateClientRequestId());
      setAppliedConfig(null);
      setConfigErrors(null);
      setConfigFileName('');
      setLanguage(DEFAULT_ROOM_LANGUAGE);
      setTimeLimit(DEFAULT_ROOM_TIME_LIMIT);
      if (problems.length === 0) {
        loadProblems();
      }
    }
  }, [isOpen]);

  useEffect(() => {
    const problem = problems.find(p => p.id === problemId);
    setSelectedProblem(problem || null);
  }, [problemId, problems]);

  const loadProblems = async () => {
    setProblemsLoading(true);
    try {
      const data = await getProblems();
      setProblems(data);
      info(`已加载 ${data.length} 道题目供选择`);
    } catch (err) {
      console.error('Failed to load problems:', err);
      showError('加载题目列表失败，请稍后重试');
    } finally {
      setProblemsLoading(false);
    }
  };

  const filteredProblems = problems.filter(p => {
    const matchesDifficulty = difficultyFilter === 'all' || p.difficulty === difficultyFilter;
    const matchesSearch = !problemSearch ||
      p.title.toLowerCase().includes(problemSearch.toLowerCase()) ||
      p.tags.some(t => t.toLowerCase().includes(problemSearch.toLowerCase()));
    return matchesDifficulty && matchesSearch;
  });

  const handleSelectProblem = (problem: Problem) => {
    setProblemId(problem.id);
    setShowProblemList(false);
  };

  const handleConfigFileSelected = async (file: File) => {
    setConfigFileName(file.name);
    setConfigParsing(true);
    setError('');
    try {
      const text = await file.text();
      // 校验题目是否存在需要题目列表，确保已加载
      let problemList = problems;
      if (problemList.length === 0) {
        problemList = await getProblems();
        setProblems(problemList);
      }
      const { config, errors } = parseRoomConfigPackage(text, problemList);
      if (!config) {
        setAppliedConfig(null);
        setConfigErrors(errors);
        showError(`配置包「${file.name}」校验未通过，请逐项修正后重新上传`);
        return;
      }
      setConfigErrors(null);
      setAppliedConfig(config);
      setTitle(config.title);
      setProblemId(config.problemId);
      setLanguage(config.language);
      setTimeLimit(config.timeLimit);
      // 幂等键与配置内容绑定：同一配置包重复上传/提交不会生成重复房间
      setClientRequestId(computeConfigPackageKey(config));
      info('配置包导入成功，请确认面试官姓名与题目后创建房间');
    } catch (err) {
      console.error('Failed to read config package:', err);
      setAppliedConfig(null);
      setConfigErrors([{ field: 'file', label: '文件读取', message: '无法读取该文件，请确认文件可访问后重试' }]);
    } finally {
      setConfigParsing(false);
    }
  };

  const handleRemoveConfig = () => {
    setAppliedConfig(null);
    setConfigErrors(null);
    setConfigFileName('');
    setLanguage(DEFAULT_ROOM_LANGUAGE);
    setTimeLimit(DEFAULT_ROOM_TIME_LIMIT);
    setClientRequestId(generateClientRequestId());
  };

  const handleDownloadTemplate = () => {
    const template = buildRoomConfigPackage({
      title: title || '前端开发工程师一面',
      problemId: problemId || problems[0]?.id || '请填写题目标识',
      language,
      timeLimit,
    });
    downloadRoomConfigPackage(template, '模板');
    info('配置包模板已下载，填写后可上传使用');
  };

  const resetForm = () => {
    setTitle('');
    setProblemId('');
    setInterviewerName('');
    setDifficultyFilter('all');
    setProblemSearch('');
    setSelectedProblem(null);
    setAppliedConfig(null);
    setConfigErrors(null);
    setConfigFileName('');
    setLanguage(DEFAULT_ROOM_LANGUAGE);
    setTimeLimit(DEFAULT_ROOM_TIME_LIMIT);
    setClientRequestId(generateClientRequestId());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !problemId || !interviewerName) {
      setError('请填写所有必填字段');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const requestData: CreateRoomRequest = {
        title,
        problemId,
        interviewerId: currentUser?.id || 'interviewer-001',
        interviewerName,
        language,
        timeLimit,
        clientRequestId,
      };
      const result: CreateRoomResponse = await createRoom(requestData);
      const user: User = {
        id: result.participant?.userId || currentUser?.id || 'interviewer-001',
        name: result.participant?.userName || interviewerName,
        email: '',
        role: result.participant?.userRole || 'INTERVIEWER',
        createdAt: new Date().toISOString(),
      };
      setCurrentUser(user);
      if (result.duplicated) {
        // 重复上传同一配置包：后端返回已创建的房间，不生成重复房间
        if (!myRooms.some(r => r.id === result.room.id)) {
          setMyRooms([result.room, ...myRooms]);
        }
        info(`该配置包已创建过房间，已为您打开已有房间（房间码：${result.room.roomCode}）`);
      } else {
        setMyRooms([result.room, ...myRooms]);
        success(`面试房间「${title}」创建成功！房间码：${result.room.roomCode}`);
      }
      onSuccess(result.room);
      onClose();
      resetForm();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '创建房间失败';
      setError(errorMessage);
      showError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '4px',
    border: '1px solid #555',
    background: '#2d2d2d',
    color: '#fff',
    fontSize: '14px',
    boxSizing: 'border-box' as const,
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#1e1e1e', borderRadius: '8px', width: '600px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', border: '1px solid #333' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ color: '#fff', margin: 0, fontSize: '20px' }}>创建面试房间</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#888', fontSize: '24px', cursor: 'pointer' }}>×</button>
        </div>

        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ color: '#ccc', fontSize: '14px' }}>配置包（可选）</label>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  style={{ background: 'transparent', border: 'none', color: '#667eea', fontSize: '12px', cursor: 'pointer', padding: 0 }}
                >
                  ⬇ 下载配置包模板
                </button>
              </div>

              {!appliedConfig && (
                <div
                  onClick={() => !configParsing && fileInputRef.current?.click()}
                  style={{
                    border: '1px dashed #555',
                    borderRadius: '6px',
                    padding: '16px',
                    textAlign: 'center',
                    cursor: configParsing ? 'wait' : 'pointer',
                    background: '#252525',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = '#667eea'}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = '#555'}
                >
                  <div style={{ color: '#ccc', fontSize: '14px' }}>
                    {configParsing ? '正在解析配置包...' : '📦 点击上传配置包（.json）'}
                  </div>
                  <div style={{ color: '#666', fontSize: '12px', marginTop: '4px' }}>
                    上传后将逐项校验并预览，确认姓名与题目后再创建房间
                  </div>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleConfigFileSelected(file);
                  }
                  // 允许修正后选择同一文件重新上传
                  e.target.value = '';
                }}
              />

              {configErrors && configErrors.length > 0 && (
                <div style={{
                  marginTop: '10px',
                  padding: '12px 14px',
                  background: 'rgba(244, 67, 54, 0.08)',
                  border: '1px solid rgba(244, 67, 54, 0.4)',
                  borderRadius: '6px',
                }}>
                  <div style={{ color: '#f44336', fontSize: '13px', fontWeight: 500, marginBottom: '8px' }}>
                    配置包「{configFileName}」校验未通过，请修正以下 {configErrors.length} 项后重新上传：
                  </div>
                  {configErrors.map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '8px', color: '#ef9a9a', fontSize: '12px', lineHeight: 1.8 }}>
                      <span style={{ flexShrink: 0 }}>✗</span>
                      <span><span style={{ fontWeight: 600 }}>{item.label}</span>：{item.message}</span>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      marginTop: '10px',
                      padding: '6px 16px',
                      borderRadius: '4px',
                      border: '1px solid #f44336',
                      background: 'transparent',
                      color: '#f44336',
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    修正后重新上传
                  </button>
                </div>
              )}

              {appliedConfig && (
                <div style={{
                  padding: '14px 16px',
                  background: 'rgba(102, 126, 234, 0.08)',
                  border: '1px solid rgba(102, 126, 234, 0.4)',
                  borderRadius: '6px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <span style={{ color: '#667eea', fontSize: '13px', fontWeight: 500 }}>
                      ✓ 已导入配置包「{configFileName}」
                    </span>
                    <button
                      type="button"
                      onClick={handleRemoveConfig}
                      title="移除配置包，恢复手动填写"
                      style={{ background: 'transparent', border: 'none', color: '#888', fontSize: '14px', cursor: 'pointer', padding: '0 4px' }}
                    >
                      ✕
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '12px' }}>
                    <div>
                      <div style={{ color: '#888', marginBottom: '2px' }}>房间标题</div>
                      <div style={{ color: '#fff' }}>{appliedConfig.title}</div>
                    </div>
                    <div>
                      <div style={{ color: '#888', marginBottom: '2px' }}>面试题目</div>
                      <div style={{ color: '#fff' }}>{selectedProblem?.title || appliedConfig.problemId}</div>
                    </div>
                    <div>
                      <div style={{ color: '#888', marginBottom: '2px' }}>编程语言</div>
                      <select
                        value={language}
                        onChange={e => setLanguage(e.target.value)}
                        style={{ ...inputStyle, padding: '6px 8px', fontSize: '12px' }}
                      >
                        {LANGUAGE_CONFIGS.map(l => (
                          <option key={l.value} value={l.value}>{l.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <div style={{ color: '#888', marginBottom: '2px' }}>面试时限（分钟）</div>
                      <input
                        type="number"
                        min={MIN_ROOM_TIME_LIMIT}
                        max={MAX_ROOM_TIME_LIMIT}
                        value={timeLimit}
                        onChange={e => setTimeLimit(Number(e.target.value) || DEFAULT_ROOM_TIME_LIMIT)}
                        style={{ ...inputStyle, padding: '6px 8px', fontSize: '12px' }}
                      />
                    </div>
                  </div>
                  <div style={{ color: '#888', fontSize: '12px', marginTop: '10px' }}>
                    已按配置包预填内容，请确认面试官姓名与面试题目后点击「创建房间」
                  </div>
                </div>
              )}
            </div>

            <div>
              <label style={{ display: 'block', color: '#ccc', marginBottom: '6px', fontSize: '14px' }}>房间标题 *</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="请输入房间标题，如：前端开发工程师一面"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={{ display: 'block', color: '#ccc', marginBottom: '6px', fontSize: '14px' }}>面试官姓名 *</label>
              <input
                type="text"
                value={interviewerName}
                onChange={e => setInterviewerName(e.target.value)}
                placeholder="请输入面试官姓名"
                style={inputStyle}
              />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ color: '#ccc', fontSize: '14px' }}>选择面试题目 *</label>
                <span style={{ color: '#666', fontSize: '12px' }}>
                  {problems.length} 道题目可用
                </span>
              </div>

              <div
                onClick={() => setShowProblemList(!showProblemList)}
                style={{
                  ...inputStyle,
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  minHeight: '44px',
                }}
              >
                {selectedProblem ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ color: '#fff' }}>{selectedProblem.title}</span>
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: '8px',
                      fontSize: '11px',
                      background: getDifficultyTag(selectedProblem.difficulty).bgColor,
                      color: getDifficultyTag(selectedProblem.difficulty).color,
                    }}>
                      {getDifficultyTag(selectedProblem.difficulty).label}
                    </span>
                  </div>
                ) : (
                  <span style={{ color: '#666' }}>点击选择题目</span>
                )}
                <span style={{ color: '#666' }}>▼</span>
              </div>

              {showProblemList && (
                <div style={{
                  marginTop: '8px',
                  background: '#252525',
                  border: '1px solid #444',
                  borderRadius: '6px',
                  maxHeight: '400px',
                  overflowY: 'auto',
                }}>
                  <div style={{ padding: '12px', borderBottom: '1px solid #333' }}>
                    <input
                      type="text"
                      value={problemSearch}
                      onChange={e => setProblemSearch(e.target.value)}
                      placeholder="搜索题目..."
                      style={{ ...inputStyle, marginBottom: '10px' }}
                      onClick={e => e.stopPropagation()}
                    />
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setDifficultyFilter('all'); }}
                        style={{
                          padding: '4px 12px',
                          borderRadius: '12px',
                          border: `1px solid ${difficultyFilter === 'all' ? '#667eea' : '#444'}`,
                          background: difficultyFilter === 'all' ? 'rgba(102, 126, 234, 0.15)' : 'transparent',
                          color: difficultyFilter === 'all' ? '#667eea' : '#888',
                          cursor: 'pointer',
                          fontSize: '12px',
                        }}
                      >
                        全部
                      </button>
                      {DIFFICULTY_TAGS.map(tag => (
                        <button
                          key={tag.value}
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setDifficultyFilter(tag.value); }}
                          style={{
                            padding: '4px 12px',
                            borderRadius: '12px',
                            border: `1px solid ${difficultyFilter === tag.value ? tag.color : '#444'}`,
                            background: difficultyFilter === tag.value ? tag.bgColor : 'transparent',
                            color: difficultyFilter === tag.value ? tag.color : '#888',
                            cursor: 'pointer',
                            fontSize: '12px',
                          }}
                        >
                          {tag.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {problemsLoading ? (
                    <div style={{ padding: '32px', textAlign: 'center', color: '#888' }}>加载中...</div>
                  ) : filteredProblems.length === 0 ? (
                    <div style={{ padding: '32px', textAlign: 'center', color: '#888' }}>没有找到匹配的题目</div>
                  ) : (
                    <div>
                      {filteredProblems.map(problem => {
                        const diffTag = getDifficultyTag(problem.difficulty);
                        const isSelected = problemId === problem.id;
                        return (
                          <div
                            key={problem.id}
                            onClick={(e) => { e.stopPropagation(); handleSelectProblem(problem); }}
                            style={{
                              padding: '12px 16px',
                              borderBottom: '1px solid #333',
                              cursor: 'pointer',
                              background: isSelected ? 'rgba(102, 126, 234, 0.1)' : 'transparent',
                              transition: 'background 0.15s',
                            }}
                            onMouseEnter={(e) => {
                              if (!isSelected) e.currentTarget.style.background = '#2a2a2a';
                            }}
                            onMouseLeave={(e) => {
                              if (!isSelected) e.currentTarget.style.background = 'transparent';
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                              <span style={{ color: isSelected ? '#667eea' : '#fff', fontWeight: isSelected ? 500 : 400 }}>
                                {problem.title}
                              </span>
                              <span style={{
                                padding: '2px 8px',
                                borderRadius: '8px',
                                fontSize: '11px',
                                background: diffTag.bgColor,
                                color: diffTag.color,
                              }}>
                                {diffTag.label}
                              </span>
                            </div>
                            {problem.tags.length > 0 && (
                              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                {problem.tags.slice(0, 3).map((tag, idx) => (
                                  <span key={idx} style={{ color: '#666', fontSize: '11px' }}>#{tag}</span>
                                ))}
                                {problem.tags.length > 3 && (
                                  <span style={{ color: '#666', fontSize: '11px' }}>+{problem.tags.length - 3}</span>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {selectedProblem && (
                <div style={{
                  marginTop: '12px',
                  padding: '16px',
                  background: '#252525',
                  borderRadius: '6px',
                  border: '1px solid #333',
                }}>
                  <div style={{ color: '#888', fontSize: '12px', marginBottom: '8px' }}>题目预览</div>
                  <p style={{ color: '#ccc', fontSize: '13px', lineHeight: 1.6, margin: 0 }}>
                    {selectedProblem.description.length > 200
                      ? selectedProblem.description.substring(0, 200) + '...'
                      : selectedProblem.description}
                  </p>
                  {selectedProblem.examples.length > 0 && (
                    <div style={{ marginTop: '12px' }}>
                      <div style={{ color: '#888', fontSize: '12px', marginBottom: '6px' }}>示例 1</div>
                      <div style={{
                        background: '#1a1a1a',
                        padding: '10px',
                        borderRadius: '4px',
                        fontFamily: 'monospace',
                        fontSize: '12px',
                        color: '#9cdcfe',
                      }}>
                        <div>输入: {selectedProblem.examples[0].input}</div>
                        <div>输出: {selectedProblem.examples[0].output}</div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {error && (
            <div style={{ margin: '0 24px 16px', color: '#f44336', fontSize: '14px', padding: '8px 12px', background: 'rgba(244,67,54,0.1)', borderRadius: '4px' }}>
              {error}
            </div>
          )}

          <div style={{ padding: '16px 24px', borderTop: '1px solid #333', display: 'flex', gap: '12px', justifyContent: 'flex-end', background: '#1a1a1a' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              style={{ padding: '10px 24px', borderRadius: '4px', border: '1px solid #555', background: 'transparent', color: '#ccc', cursor: 'pointer', fontSize: '14px' }}
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading || !problemId}
              style={{ padding: '10px 24px', borderRadius: '4px', border: 'none', background: '#4caf50', color: '#fff', cursor: (loading || !problemId) ? 'not-allowed' : 'pointer', fontSize: '14px', opacity: (loading || !problemId) ? 0.5 : 1 }}
            >
              {loading ? '创建中...' : '创建房间'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
