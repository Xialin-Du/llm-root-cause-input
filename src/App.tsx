import React, { useState, useRef, useEffect } from 'react';
import { 
  Layout, 
  Card, 
  Input, 
  Button, 
  message, 
  Spin, 
  Tabs, 
  Space,
  Typography,
  Tag,
  Progress,
  Divider,
  ConfigProvider,
  theme
} from 'antd';
import { 
  UploadOutlined, 
  SendOutlined, 
  ClearOutlined,
  FileTextOutlined,
  DownloadOutlined,
  DeleteOutlined,
  SunOutlined,
  MoonOutlined,
  CloudServerOutlined
} from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const { Header, Content, Footer } = Layout;
const { TextArea } = Input;
const { Title, Paragraph, Text } = Typography;

// 后端API配置
const API_BASE_URL = 'http://localhost:8000/api';

// 消息类型定义
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  fileName?: string;
}

// 上传文件类型定义
interface UploadedFile {
  name: string;
  size: number;
  type: string;
  content: string;
}

const App: React.FC = () => {
  // 状态管理
  const [inputText, setInputText] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    // 默认深色模式（运维系统最佳实践）
    return localStorage.getItem('theme') !== 'light';
  });
  
  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 保存主题设置到本地存储
  useEffect(() => {
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  // 自动滚动到底部
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 文件大小格式化
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  // 点击上传按钮触发原生文件选择
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  // 文件处理函数
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    const file = files[0];
    const maxSize = 100 * 1024 * 1024; // 100MB限制

    // 检查文件大小
    if (file.size > maxSize) {
      message.error(`文件大小不能超过100MB，当前文件大小: ${formatFileSize(file.size)}`);
      e.target.value = '';
      return;
    }

    // 检查文件类型
    const allowedExtensions = ['.txt', '.log', '.csv', '.json', '.md'];
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    
    if (!allowedExtensions.includes(fileExtension)) {
      message.error(`不支持的文件格式，请上传 ${allowedExtensions.join(', ')} 文件`);
      e.target.value = '';
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    const reader = new FileReader();
    
    // 真实的文件读取进度
    reader.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        setUploadProgress(percent);
      }
    };

    reader.onload = (event) => {
      const content = event.target?.result as string;
      
      setUploadedFile({
        name: file.name,
        size: file.size,
        type: file.type,
        content: content
      });

      message.success(`文件 "${file.name}" 上传成功`);
      setIsUploading(false);
      e.target.value = '';
    };
    
    reader.onerror = () => {
      message.error('文件读取失败，请检查文件是否损坏');
      setIsUploading(false);
      e.target.value = '';
    };
    
    reader.readAsText(file);
  };

  // 文件下载功能
  const handleDownloadFile = () => {
    if (!uploadedFile) return;

    const blob = new Blob([uploadedFile.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    link.href = url;
    link.download = uploadedFile.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    message.success(`文件 "${uploadedFile.name}" 下载成功`);
  };

  // 删除上传的文件
  const handleDeleteFile = () => {
    setUploadedFile(null);
    setUploadProgress(0);
    message.info('文件已删除');
  };

  // 发送请求到后端LLM API
  const sendToLLM = async (prompt: string, fileName?: string) => {
    setIsLoading(true);
    
    // 添加用户消息
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: prompt,
      timestamp: new Date(),
      fileName: fileName
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setUploadedFile(null);
    setUploadProgress(0);
    
    // 添加空的助手消息，用于流式填充
    const assistantMessageId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date()
    }]);

    try {
      const response = await fetch(`${API_BASE_URL}/llm/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: prompt,
          stream: true
        }),
        signal: AbortSignal.timeout(300000) // 5分钟超时
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('无法读取响应流');
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        
        // 流式更新助手消息
        setMessages(prev => prev.map(msg => 
          msg.id === assistantMessageId 
            ? { ...msg, content: msg.content + chunk }
            : msg
        ));
      }
    } catch (error) {
      console.error('LLM API调用失败:', error);
      message.error('调用大模型API失败，请检查后端服务是否正常运行');
      
      // 更新错误消息
      setMessages(prev => prev.map(msg => 
        msg.id === assistantMessageId 
          ? { ...msg, content: '**错误：** 无法连接到后端服务，请检查网络连接或后端服务状态。' }
          : msg
      ));
    } finally {
      setIsLoading(false);
    }
  };

  // 提交按钮处理
  const handleSubmit = () => {
    if (!inputText.trim() && !uploadedFile) {
      message.warning('请输入文本或上传文件');
      return;
    }
    
    let fullPrompt = inputText;
    let fileName: string | undefined = undefined;
    
    if (uploadedFile) {
      fileName = uploadedFile.name;
      fullPrompt += `\n\n--- 上传的文件内容 (${uploadedFile.name}) ---\n${uploadedFile.content}`;
    }
    
    sendToLLM(fullPrompt, fileName);
  };

  // 清空历史
  const handleClearHistory = () => {
    setMessages([]);
    message.info('对话历史已清空');
  };

  // 企业级主题配置
  const themeConfig = {
    algorithm: isDarkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      colorPrimary: '#1677ff',
      borderRadius: 6,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    },
    components: {
      Card: {
        boxShadow: isDarkMode 
          ? '0 1px 2px 0 rgba(0, 0, 0, 0.3), 0 1px 6px -1px rgba(0, 0, 0, 0.2), 0 2px 4px 0 rgba(0, 0, 0, 0.2)'
          : '0 1px 2px 0 rgba(0, 0, 0, 0.03), 0 1px 6px -1px rgba(0, 0, 0, 0.02), 0 2px 4px 0 rgba(0, 0, 0, 0.02)',
      },
      Button: {
        borderRadius: 6,
        controlHeight: 36,
      },
      Input: {
        borderRadius: 6,
      },
      Tabs: {
        borderRadius: 6,
      }
    }
  };

  return (
    <ConfigProvider theme={themeConfig}>
      <Layout style={{ minHeight: '100vh', background: isDarkMode ? '#0f1419' : '#f5f7fa' }}>
        {/* 顶部导航栏 - 企业级设计 */}
        <Header style={{ 
          background: isDarkMode ? '#161b22' : '#ffffff',
          padding: '0 32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: isDarkMode 
            ? '0 1px 0 rgba(255, 255, 255, 0.08)' 
            : '0 1px 2px rgba(0, 0, 0, 0.05)',
          borderBottom: isDarkMode ? '1px solid #30363d' : '1px solid #e8e8e8'
        }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <CloudServerOutlined style={{ fontSize: '28px', color: '#1677ff', marginRight: '12px' }} />
            <Title level={4} style={{ 
              color: isDarkMode ? '#f0f6fc' : '#1f2329', 
              margin: 0,
              fontWeight: 600
            }}>
              LLM 根因定位与分析系统
            </Title>
            <Tag color="blue" style={{ marginLeft: '16px', fontSize: '12px' }}>v1.0</Tag>
          </div>
          
          <Button 
            type="text"
            icon={isDarkMode ? <SunOutlined /> : <MoonOutlined />}
            onClick={() => setIsDarkMode(!isDarkMode)}
            style={{ fontSize: '18px' }}
          />
        </Header>
        
        <Content style={{ padding: '24px 32px' }}>
          <div style={{ 
            maxWidth: '1600px', 
            margin: '0 auto',
            display: 'grid',
            gridTemplateColumns: '1fr 1.2fr',
            gap: '24px',
            height: 'calc(100vh - 136px)'
          }}>
            {/* 左侧：输入区域 */}
            <Card 
              title="数据输入" 
              bordered={false}
              styles={{
                body: { 
                  padding: '20px', 
                  display: 'flex', 
                  flexDirection: 'column', 
                  height: '100%',
                  overflow: 'hidden'
                }
              }}
              extra={
                <Space>
                  {/* 隐藏的原生文件输入 */}
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept=".txt,.log,.csv,.json,.md"
                    style={{ display: 'none' }}
                  />
                  
                  {/* 自定义上传按钮 */}
                  <Button 
                    type="primary"
                    ghost
                    icon={<UploadOutlined />} 
                    loading={isUploading}
                    onClick={handleUploadClick}
                    disabled={isLoading}
                  >
                    {isUploading ? '上传中...' : '上传数据文件'}
                  </Button>
                  
                  <Button 
                    icon={<ClearOutlined />} 
                    onClick={() => {
                      setInputText('');
                      setUploadedFile(null);
                      setUploadProgress(0);
                    }}
                    disabled={isLoading}
                  >
                    清空
                  </Button>
                </Space>
              }
            >
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {/* 上传进度条 */}
                {isUploading && (
                  <Progress 
                    percent={uploadProgress} 
                    status="active" 
                    style={{ marginBottom: '16px' }}
                    size="small"
                  />
                )}

                {/* 已上传文件信息 - 美化版 */}
                {uploadedFile && (
                  <div style={{ 
                    padding: '14px 16px', 
                    background: isDarkMode ? '#1c2128' : '#f0f7ff', 
                    borderRadius: '8px', 
                    marginBottom: '16px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    border: isDarkMode ? '1px solid #30363d' : '1px solid #bae0ff'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <FileTextOutlined style={{ 
                        fontSize: '20px', 
                        color: '#1677ff', 
                        marginRight: '12px' 
                      }} />
                      <div>
                        <Text strong style={{ fontSize: '14px' }}>{uploadedFile.name}</Text>
                        <div>
                          <Tag color="blue" size="small" style={{ marginTop: '4px' }}>
                            {formatFileSize(uploadedFile.size)}
                          </Tag>
                        </div>
                      </div>
                    </div>
                    <Space>
                      <Button 
                        type="text" 
                        size="small"
                        icon={<DownloadOutlined />} 
                        onClick={handleDownloadFile}
                        title="下载文件"
                      />
                      <Button 
                        type="text" 
                        size="small"
                        danger 
                        icon={<DeleteOutlined />} 
                        onClick={handleDeleteFile}
                        title="删除文件"
                      />
                    </Space>
                  </div>
                )}

                <Tabs
                  items={[
                    {
                      key: 'text',
                      label: '文本输入',
                      children: (
                        <TextArea
                          value={inputText}
                          onChange={(e) => setInputText(e.target.value)}
                          placeholder="请输入需要分析的告警信息、系统日志、性能指标或问题描述..."
                          rows={uploadedFile ? 10 : 15}
                          style={{ marginBottom: '16px' }}
                          disabled={isLoading}
                          autoSize={{ minRows: uploadedFile ? 10 : 15, maxRows: 20 }}
                        />
                      )
                    },
                    {
                      key: 'file',
                      label: '文件内容预览',
                      children: uploadedFile ? (
                        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                          {uploadedFile.size > 5 * 1024 * 1024 && (
                            <div style={{ 
                              padding: '10px 12px', 
                              background: isDarkMode ? '#2a2415' : '#fffbe6', 
                              border: isDarkMode ? '1px solid #463a1a' : '1px solid #ffe58f', 
                              borderRadius: '6px', 
                              marginBottom: '12px' 
                            }}>
                              <Text type="warning" style={{ fontSize: '13px' }}>
                                ⚠️ 文件较大（{formatFileSize(uploadedFile.size)}），仅预览前5000行，完整内容将全部发送给大模型
                              </Text>
                            </div>
                          )}
                          <TextArea
                            value={uploadedFile.size > 5 * 1024 * 1024 
                              ? uploadedFile.content.split('\n').slice(0, 5000).join('\n') + '\n\n...（文件过大，预览已截断）'
                              : uploadedFile.content}
                            onChange={(e) => setUploadedFile(prev => 
                              prev ? { ...prev, content: e.target.value } : null
                            )}
                            rows={13}
                            readOnly={uploadedFile.size > 5 * 1024 * 1024}
                            style={{ marginBottom: '16px', flex: 1 }}
                          />
                        </div>
                      ) : (
                        <div style={{ 
                          textAlign: 'center', 
                          padding: '80px 0',
                          color: isDarkMode ? '#8b949e' : '#999'
                        }}>
                          <FileTextOutlined style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.3 }} />
                          <Paragraph>请先上传数据文件</Paragraph>
                          <Paragraph type="secondary">
                            支持 .txt, .log, .csv, .json, .md 格式，最大100MB
                          </Paragraph>
                        </div>
                      )
                    }
                  ]}
                />
                
                <Divider style={{ margin: '12px 0' }} />
                
                <Button 
                  type="primary" 
                  size="large"
                  icon={<SendOutlined />}
                  onClick={handleSubmit}
                  loading={isLoading}
                  style={{ marginTop: 'auto', height: '44px', fontSize: '15px', fontWeight: 500 }}
                  block
                >
                  {isLoading ? '正在分析中，请稍候...' : '开始根因分析'}
                </Button>
              </div>
            </Card>
            
            {/* 右侧：输出区域 */}
            <Card 
              title="分析结果" 
              bordered={false}
              styles={{
                body: { 
                  padding: '20px', 
                  display: 'flex', 
                  flexDirection: 'column', 
                  height: '100%',
                  overflow: 'hidden'
                }
              }}
              extra={
                <Button 
                  icon={<ClearOutlined />} 
                  onClick={handleClearHistory}
                  disabled={messages.length === 0 || isLoading}
                  size="small"
                >
                  清空历史
                </Button>
              }
            >
              <div style={{ 
                flex: 1, 
                overflowY: 'auto',
                padding: '0 8px',
                scrollBehavior: 'smooth'
              }}>
                {messages.length === 0 ? (
                  <div style={{ 
                    textAlign: 'center', 
                    padding: '120px 0',
                    color: isDarkMode ? '#8b949e' : '#999'
                  }}>
                    <CloudServerOutlined style={{ fontSize: '64px', marginBottom: '20px', opacity: 0.2 }} />
                    <Title level={4} style={{ color: isDarkMode ? '#8b949e' : '#999', marginBottom: '12px' }}>
                      开始根因分析
                    </Title>
                    <Paragraph type="secondary">
                      在左侧输入告警信息、系统日志或上传数据文件
                    </Paragraph>
                    <Paragraph type="secondary">
                      点击"开始根因分析"按钮获取专业的故障分析报告
                    </Paragraph>
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div 
                      key={msg.id}
                      style={{
                        marginBottom: '24px',
                        borderRadius: '10px',
                        background: msg.role === 'user' 
                          ? (isDarkMode ? '#1c2128' : '#e6f4ff') 
                          : (isDarkMode ? '#161b22' : '#ffffff'),
                        border: msg.role === 'user'
                          ? (isDarkMode ? '1px solid #30363d' : '1px solid #91caff')
                          : (isDarkMode ? '1px solid #30363d' : '1px solid #e8e8e8'),
                        boxShadow: isDarkMode 
                          ? '0 1px 3px rgba(0, 0, 0, 0.3)' 
                          : '0 2px 8px rgba(0, 0, 0, 0.06)',
                        overflow: 'hidden'
                      }}
                    >
                      {/* 消息头部 */}
                      <div style={{ 
                        padding: '12px 16px',
                        background: msg.role === 'user'
                          ? (isDarkMode ? '#2386361a' : '#1677ff0a')
                          : (isDarkMode ? '#2386361a' : '#52c41a0a'),
                        borderBottom: msg.role === 'user'
                          ? (isDarkMode ? '1px solid #30363d' : '1px solid #bae0ff')
                          : (isDarkMode ? '1px solid #30363d' : '1px solid #b7eb8f'),
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <span style={{ 
                            fontSize: '16px', 
                            marginRight: '8px'
                          }}>
                            {msg.role === 'user' ? '👤' : '🤖'}
                          </span>
                          <Text strong style={{ fontSize: '14px' }}>
                            {msg.role === 'user' ? '输入数据' : '分析结果'}
                          </Text>
                          {msg.fileName && (
                            <Tag color="blue" size="small" style={{ marginLeft: '12px' }}>
                              附件: {msg.fileName}
                            </Tag>
                          )}
                        </div>
                        <Text type="secondary" style={{ fontSize: '12px' }}>
                          {msg.timestamp.toLocaleTimeString()}
                        </Text>
                      </div>
                      
                      {/* 消息内容 */}
                      <div style={{ 
                        padding: '16px',
                        lineHeight: '1.7'
                      }}>
                        {msg.role === 'assistant' ? (
                          <div style={{ 
                            color: isDarkMode ? '#f0f6fc' : '#1f2329',
                            '& h1, & h2, & h3, & h4, & h5, & h6': {
                              marginTop: '16px',
                              marginBottom: '8px',
                              fontWeight: 600
                            },
                            '& p': {
                              marginBottom: '8px'
                            },
                            '& ul, & ol': {
                              marginBottom: '8px',
                              paddingLeft: '20px'
                            },
                            '& li': {
                              marginBottom: '4px'
                            },
                            '& code': {
                              background: isDarkMode ? '#21262d' : '#f6f8fa',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontSize: '13px'
                            },
                            '& pre': {
                              background: isDarkMode ? '#0d1117' : '#f6f8fa',
                              padding: '12px',
                              borderRadius: '6px',
                              overflowX: 'auto',
                              border: isDarkMode ? '1px solid #30363d' : '1px solid #e8e8e8'
                            }
                          }}>
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {msg.content}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          <pre style={{ 
                            whiteSpace: 'pre-wrap', 
                            wordBreak: 'break-all',
                            margin: 0,
                            fontFamily: 'Consolas, Monaco, "Andale Mono", "Ubuntu Mono", monospace',
                            fontSize: '13px',
                            color: isDarkMode ? '#c9d1d9' : '#24292f',
                            background: isDarkMode ? '#0d1117' : '#f6f8fa',
                            padding: '12px',
                            borderRadius: '6px',
                            border: isDarkMode ? '1px solid #30363d' : '1px solid #e8e8e8'
                          }}>
                            {msg.content.length > 1500 
                              ? msg.content.substring(0, 1500) + '\n\n...（内容过长已截断，完整内容已发送给大模型）' 
                              : msg.content}
                          </pre>
                        )}
                      </div>
                    </div>
                  ))
                )}
                
                {isLoading && (
                  <div style={{ 
                    textAlign: 'center', 
                    padding: '30px',
                    background: isDarkMode ? '#161b22' : '#ffffff',
                    borderRadius: '10px',
                    border: isDarkMode ? '1px solid #30363d' : '1px solid #e8e8e8',
                    marginBottom: '24px'
                  }}>
                    <Spin size="large" />
                    <div style={{ marginTop: '12px', color: isDarkMode ? '#8b949e' : '#999' }}>
                      大模型正在分析数据并生成报告，请稍候...
                    </div>
                  </div>
                )}
                
                <div ref={messagesEndRef} />
              </div>
            </Card>
          </div>
        </Content>
        
        <Footer style={{ 
          textAlign: 'center', 
          background: isDarkMode ? '#0f1419' : '#f5f7fa',
          color: isDarkMode ? '#8b949e' : '#666',
          padding: '16px 0',
          borderTop: isDarkMode ? '1px solid #30363d' : '1px solid #e8e8e8'
        }}>
          LLM 根因定位与分析系统 ©{new Date().getFullYear()} | 企业级智能运维解决方案
        </Footer>
      </Layout>
    </ConfigProvider>
  );
};

export default App;