import React, { useState, useEffect, useRef } from 'react';
import { createRoom } from '../services/interviewRoomService';
import { getProblems } from '../services/problemService';
import type { InterviewRoom, CreateRoomRequest, CreateRoomResponse, User, Problem, RoomConfigPackage } from '../types';
import { DIFFICULTY_TAGS, getDifficultyTag, getLanguageConfig } from '../types';
import { validateRoomConfigPackage, CONFIG_PACKAGE_FIELD_LABELS } from '../utils/roomConfigPackage';
import type { ConfigPackageError } from '../utils/roomConfigPackage';
import { useInterviewStore } from '../store/interview';
import { useToastStore } from '../store/toast';

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
  const [configPackage, setConfigPackage] = useState<RoomConfigPackage | null>(null);
  const [configErrors, setConfigErrors] = useState<ConfigPackageError[]>([]);
  const [configFileName, setConfigFileName] = useState('');
  const configFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && problems.length === 0) {
      loadProblems();
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

  const handleConfigFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // 允许修正后选择同一个文件重新上传
    e.target.value = '';
    if (!file) return;
    setConfigFileName(file.name);
    setError('');
    try {
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        setConfigPackage(null);
        setConfigErrors([{ field: 'file', message: '文件格式错误：不是有效的 JSON 文件' }]);
        showError('配置包解析失败：不是有效的 JSON 文件');
        return;
      }
      const result = validateRoomConfigPackage(parsed, problems);
      if (result.errors.length > 0) {
        // 校验未通过：配置包不生效，但把合法字段预填进表单，便于手动修正
        setConfigPackage(null);
        setConfigErrors(result.errors);
        if (result.partial.title) setTitle(result.partial.title);
        if (result.partial.problemId) setProblemId(result.partial.problemId);
        showError(`配置包校验未通过，发现 ${result.errors.length} 处问题，请修正后重新上传`);
        return;
      }
      const pkg = result.config!;
      setConfigPackage(pkg);
      setConfigErrors([]);
      setTitle(pkg.title);
      setProblemId(pkg.problemId);
      success('配置包上传成功，请确认面试官姓名与题目后创建房间');
    } catch {
      setConfigPackage(null);
      setConfigErrors([{ field: 'file', message: '文件读取失败，请重试' }]);
      showError('配置包读取失败，请重试');
    }
  };

  const handleRemoveConfigPackage = () => {
    setConfigPackage(null);
    setConfigErrors([]);
    setConfigFileName('');
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
      };
      if (configPackage) {
        requestData.language = configPackage.language;
        requestData.timeLimit = configPackage.timeLimit;
        requestData.configPackageId = configPackage.packageId;
      }
      const result: CreateRoomResponse = await createRoom(requestData);
      const user: User = {
        id: result.participant.userId,
        name: result.participant.userName,
        email: '',
        role: result.participant.userRole,
        createdAt: new Date().toISOString(),
      };
      setCurrentUser(user);
      if (result.duplicated) {
        // 同一配置包重复上传：后端返回已有房间，列表不重复添加
        if (!myRooms.some(r => r.id === result.room.id)) {
          setMyRooms([result.room, ...myRooms]);
        }
        info(`配置包已创建过房间「${result.room.title}」，已为你打开已有房间，未重复创建`);
      } else {
        setMyRooms([result.room, ...myRooms]);
        success(`面试房间「${title}」创建成功！房间码：${result.room.roomCode}`);
      }
      onSuccess(result.room);
      onClose();
      setTitle('');
      setProblemId('');
      setInterviewerName('');
      setDifficultyFilter('all');
      setProblemSearch('');
      setSelectedProblem(null);
      setConfigPackage(null);
      setConfigErrors([]);
      setConfigFileName('');
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
                {configPackage && (
                  <span style={{ color: '#4caf50', fontSize: '12px' }}>✓ 已加载配置包</span>
                )}
              </div>
              <input
                ref={configFileInputRef}
                type="file"
                accept=".json,application/json"
                style={{ display: 'none' }}
                onChange={handleConfigFileChange}
              />

              {!configPackage && configErrors.length === 0 && (
                <div
                  onClick={() => { if (!problemsLoading) configFileInputRef.current?.click(); }}
                  style={{
                    padding: '16px',
                    border: '1px dashed #555',
                    borderRadius: '6px',
                    textAlign: 'center',
                    cursor: problemsLoading ? 'not-allowed' : 'pointer',
                    opacity: problemsLoading ? 0.5 : 1,
                    background: '#252525',
                  }}
                >
                  <div style={{ color: '#ccc', fontSize: '14px', marginBottom: '4px' }}>
                    📦 {problemsLoading ? '题目加载中，暂不能上传…' : '点击上传配置包（.json）'}
                  </div>
                  <div style={{ color: '#666', fontSize: '12px' }}>
                    上传后自动填充房间标题、题目、语言与时限；不上传可手动填写
                  </div>
                </div>
              )}

              {configErrors.length > 0 && (
                <div style={{
                  padding: '14px 16px',
                  background: 'rgba(244, 67, 54, 0.08)',
                  border: '1px solid rgba(244, 67, 54, 0.4)',
                  borderRadius: '6px',
                }}>
                  <div style={{ color: '#f44336', fontSize: '14px', fontWeight: 500, marginBottom: '8px' }}>
                    ⚠ 配置包校验未通过{configFileName ? `（${configFileName}）` : ''}，请逐项修正：
                  </div>
                  <ul style={{ margin: '0 0 12px 0', paddingLeft: '4px', listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {configErrors.map((err, idx) => (
                      <li key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '13px' }}>
                        <span style={{
                          flexShrink: 0,
                          padding: '1px 8px',
                          borderRadius: '8px',
                          background: 'rgba(244, 67, 54, 0.15)',
                          color: '#f44336',
                          fontSize: '11px',
                          marginTop: '1px',
                        }}>
                          {CONFIG_PACKAGE_FIELD_LABELS[err.field]}
                        </span>
                        <span style={{ color: '#e0a39e' }}>{err.message}</span>
                      </li>
                    ))}
                  </ul>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button
                      type="button"
                      onClick={() => configFileInputRef.current?.click()}
                      style={{ padding: '6px 14px', borderRadius: '4px', border: 'none', background: '#f44336', color: '#fff', cursor: 'pointer', fontSize: '12px' }}
                    >
                      修正后重新上传
                    </button>
                    <button
                      type="button"
                      onClick={handleRemoveConfigPackage}
                      style={{ padding: '6px 14px', borderRadius: '4px', border: '1px solid #555', background: 'transparent', color: '#ccc', cursor: 'pointer', fontSize: '12px' }}
                    >
                      清除
                    </button>
                    <span style={{ color: '#888', fontSize: '12px' }}>也可以直接在下方手动填写</span>
                  </div>
                </div>
              )}

              {configPackage && (
                <div style={{
                  padding: '14px 16px',
                  background: 'rgba(76, 175, 80, 0.08)',
                  border: '1px solid rgba(76, 175, 80, 0.35)',
                  borderRadius: '6px',
                }}>
                  <div style={{ color: '#4caf50', fontSize: '14px', fontWeight: 500, marginBottom: '10px' }}>
                    📦 配置包预览{configFileName ? `（${configFileName}）` : ''}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', marginBottom: '10px' }}>
                    <div style={{ fontSize: '13px' }}>
                      <span style={{ color: '#888' }}>房间标题：</span>
                      <span style={{ color: '#fff' }}>{configPackage.title}</span>
                    </div>
                    <div style={{ fontSize: '13px' }}>
                      <span style={{ color: '#888' }}>编程语言：</span>
                      <span style={{ color: '#fff' }}>{getLanguageConfig(configPackage.language).label}</span>
                    </div>
                    <div style={{ fontSize: '13px' }}>
                      <span style={{ color: '#888' }}>面试时限：</span>
                      <span style={{ color: '#fff' }}>{configPackage.timeLimit} 分钟</span>
                    </div>
                    <div style={{ fontSize: '13px' }}>
                      <span style={{ color: '#888' }}>题目标识：</span>
                      <span style={{ color: '#9cdcfe', fontFamily: 'monospace', fontSize: '12px' }}>{configPackage.problemId}</span>
                    </div>
                  </div>
                  <div style={{ color: '#888', fontSize: '12px', marginBottom: '10px' }}>
                    请确认面试官姓名与题目选择后创建房间；重复上传同一配置包不会重复创建房间
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => configFileInputRef.current?.click()}
                      style={{ padding: '6px 14px', borderRadius: '4px', border: '1px solid #555', background: 'transparent', color: '#ccc', cursor: 'pointer', fontSize: '12px' }}
                    >
                      重新上传
                    </button>
                    <button
                      type="button"
                      onClick={handleRemoveConfigPackage}
                      style={{ padding: '6px 14px', borderRadius: '4px', border: '1px solid #555', background: 'transparent', color: '#ccc', cursor: 'pointer', fontSize: '12px' }}
                    >
                      移除配置包
                    </button>
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
