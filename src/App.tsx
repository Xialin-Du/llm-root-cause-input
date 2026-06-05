import React, { useState, useRef } from 'react';
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
  Progress
} from 'antd';
import { 
  UploadOutlined, 
  SendOutlined, 
  ClearOutlined,
  FileTextOutlined,
  DownloadOutlined,
  DeleteOutlined
} from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const { Header, Content, Footer } = Layout;
const { TextArea } = Input;
const { Title, Paragraph, Text } = Typography;

// 后端API配置 - 修改为你的实际后端地址
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
  
  // 原生文件输入ref
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

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

  // 原生文件选择处理（100%可靠）
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    const file = files[0];
    const maxSize = 10 * 1024 * 1024; // 10MB限制

    // 检查文件大小
    if (file.size > maxSize) {
      message.error(`文件大小不能超过10MB，当前文件大小: ${formatFileSize(file.size)}`);
      // 清空input，允许重复选择同一个文件
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
    
    // 模拟上传进度
    const progressInterval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + 10;
      });
    }, 50);

    reader.onload = (event) => {
      clearInterval(progressInterval);
      setUploadProgress(100);
      
      const content = event.target?.result as string;
      
      setUploadedFile({
        name: file.name,
        size: file.size,
        type: file.type,
        content: content
      });

      message.success(`文件 "${file.name}" 上传成功`);
      setIsUploading(false);
      // 清空input，允许重复选择同一个文件
      e.target.value = '';
    };
    
    reader.onerror = () => {
      clearInterval(progressInterval);
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
        
        scrollToBottom();
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

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ 
        background: '#001529', 
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center'
      }}>
        <Title level={3} style={{ color: 'white', margin: 0 }}>
          基于大模型和告警因果图的网络告警智能根因定位系统
        </Title>
      </Header>
      
      <Content style={{ padding: '24px' }}>
        <div style={{ 
          maxWidth: '1200px', 
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '24px',
          height: 'calc(100vh - 140px)'
        }}>
          {/* 左侧：输入区域 */}
          <Card 
            title="数据输入" 
            bordered={false}
            style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
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
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              {/* 上传进度条 */}
              {isUploading && (
                <Progress 
                  percent={uploadProgress} 
                  status="active" 
                  style={{ marginBottom: '16px' }}
                />
              )}

              {/* 已上传文件信息 */}
              {uploadedFile && (
                <div style={{ 
                  padding: '12px', 
                  background: '#f0f5ff', 
                  borderRadius: '8px', 
                  marginBottom: '16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div>
                    <FileTextOutlined style={{ marginRight: '8px', color: '#1890ff' }} />
                    <Text strong>{uploadedFile.name}</Text>
                    <Tag color="blue" style={{ marginLeft: '8px' }}>
                      {formatFileSize(uploadedFile.size)}
                    </Tag>
                  </div>
                  <Space>
                    <Button 
                      type="text" 
                      icon={<DownloadOutlined />} 
                      onClick={handleDownloadFile}
                      title="下载文件"
                    />
                    <Button 
                      type="text" 
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
                        placeholder="请输入需要分析的告警信息、日志内容或问题描述..."
                        rows={uploadedFile ? 10 : 15}
                        style={{ marginBottom: '16px' }}
                        disabled={isLoading}
                      />
                    )
                  },
                  {
                    key: 'file',
                    label: '文件内容预览',
                    children: uploadedFile ? (
                      <TextArea
                        value={uploadedFile.content}
                        onChange={(e) => setUploadedFile(prev => 
                          prev ? { ...prev, content: e.target.value } : null
                        )}
                        rows={13}
                        readOnly={false}
                        style={{ marginBottom: '16px' }}
                      />
                    ) : (
                      <div style={{ 
                        textAlign: 'center', 
                        padding: '60px 0',
                        color: '#999'
                      }}>
                        <Paragraph>请先上传数据文件</Paragraph>
                        <Paragraph type="secondary">
                          支持 .txt, .log, .csv, .json, .md 格式
                        </Paragraph>
                      </div>
                    )
                  }
                ]}
              />
              
              <Button 
                type="primary" 
                size="large"
                icon={<SendOutlined />}
                onClick={handleSubmit}
                loading={isLoading}
                style={{ marginTop: 'auto' }}
                block
              >
                {isLoading ? '分析中...' : '开始根因分析'}
              </Button>
            </div>
          </Card>
          
          {/* 右侧：输出区域 */}
          <Card 
            title="分析结果" 
            bordered={false}
            style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
            extra={
              <Button 
                icon={<ClearOutlined />} 
                onClick={handleClearHistory}
                disabled={messages.length === 0 || isLoading}
              >
                清空历史
              </Button>
            }
          >
            <div style={{ 
              flex: 1, 
              overflowY: 'auto',
              padding: '0 8px'
            }}>
              {messages.length === 0 ? (
                <div style={{ 
                  textAlign: 'center', 
                  padding: '60px 0',
                  color: '#999'
                }}>
                  <Paragraph>输入数据后点击"开始根因分析"</Paragraph>
                  <Paragraph type="secondary">
                    支持输入告警信息、系统日志、性能指标等数据
                  </Paragraph>
                </div>
              ) : (
                messages.map((msg) => (
                  <div 
                    key={msg.id}
                    style={{
                      marginBottom: '24px',
                      padding: '16px',
                      borderRadius: '8px',
                      background: msg.role === 'user' ? '#e6f7ff' : '#f6ffed',
                      borderLeft: `4px solid ${msg.role === 'user' ? '#1890ff' : '#52c41a'}`
                    }}
                  >
                    <div style={{ 
                      fontWeight: 'bold', 
                      marginBottom: '8px',
                      color: msg.role === 'user' ? '#1890ff' : '#52c41a',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <span>
                        {msg.role === 'user' ? '👤 输入数据' : '🤖 分析结果'}
                        {msg.fileName && (
                          <Tag color="blue" style={{ marginLeft: '8px' }}>
                            附件: {msg.fileName}
                          </Tag>
                        )}
                      </span>
                      <Text type="secondary" style={{ fontSize: '12px' }}>
                        {msg.timestamp.toLocaleTimeString()}
                      </Text>
                    </div>
                    <div style={{ lineHeight: '1.6' }}>
                      {msg.role === 'assistant' ? (
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {msg.content}
                        </ReactMarkdown>
                      ) : (
                        <pre style={{ 
                          whiteSpace: 'pre-wrap', 
                          wordBreak: 'break-all',
                          margin: 0,
                          fontFamily: 'monospace',
                          fontSize: '13px'
                        }}>
                          {msg.content.length > 1000 
                            ? msg.content.substring(0, 1000) + '\n\n...（内容过长已截断，完整内容已发送给大模型）' 
                            : msg.content}
                        </pre>
                      )}
                    </div>
                  </div>
                ))
              )}
              
              {isLoading && (
                <div style={{ textAlign: 'center', padding: '20px' }}>
                  <Spin size="large" />
                  <div style={{ marginTop: '8px', color: '#999' }}>
                    大模型正在分析中，请稍候...
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>
          </Card>
        </div>
      </Content>
      
      <Footer style={{ textAlign: 'center' }}>
        基于大模型和告警因果图的网络告警智能根因定位系统 ©{new Date().getFullYear()}
      </Footer>
    </Layout>
  );
};

export default App;
