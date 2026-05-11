import React, { useState, useRef } from 'react';
import { 
  Layout, 
  Card, 
  Input, 
  Button, 
  Upload, 
  message, 
  Spin, 
  Tabs, 
  Space,
  Typography
} from 'antd';
import { 
  UploadOutlined, 
  SendOutlined, 
  ClearOutlined,
  FileTextOutlined
} from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const { Header, Content, Footer } = Layout;
const { TextArea } = Input;
const { Title, Paragraph } = Typography;

// 后端API配置 - 修改为你的实际后端地址
const API_BASE_URL = 'http://localhost:8000/api';

// 消息类型定义
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const App: React.FC = () => {
  // 状态管理
  const [inputText, setInputText] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // 文件上传处理
  const handleFileUpload = (options: any) => {
    const { file } = options;
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setFileContent(content);
      setUploadedFile(file);
      message.success(`文件 "${file.name}" 上传成功，大小: ${(file.size / 1024).toFixed(2)} KB`);
    };
    
    reader.onerror = () => {
      message.error('文件读取失败');
    };
    
    // 支持的文件格式
    if (file.type === 'text/plain' || 
        file.name.endsWith('.log') || 
        file.name.endsWith('.csv') || 
        file.name.endsWith('.json') ||
        file.name.endsWith('.txt')) {
      reader.readAsText(file);
    } else {
      message.error('不支持的文件格式，请上传 .txt, .log, .csv, .json 文件');
    }
    
    // 阻止Ant Design默认上传行为
    return false;
  };

  // 发送请求到后端LLM API
  const sendToLLM = async (prompt: string) => {
    setIsLoading(true);
    
    // 添加用户消息
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: prompt,
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setFileContent('');
    setUploadedFile(null);
    
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
    if (!inputText.trim() && !fileContent.trim()) {
      message.warning('请输入文本或上传文件');
      return;
    }
    
    let fullPrompt = inputText;
    if (fileContent) {
      fullPrompt += `\n\n--- 上传的文件内容 (${uploadedFile?.name}) ---\n${fileContent}`;
    }
    
    sendToLLM(fullPrompt);
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
          LLM 根因定位与分析系统
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
                <Upload 
                  beforeUpload={handleFileUpload}
                  showUploadList={false}
                  accept=".txt,.log,.csv,.json"
                >
                  <Button icon={<UploadOutlined />}>
                    上传数据文件
                  </Button>
                </Upload>
                <Button 
                  icon={<ClearOutlined />} 
                  onClick={() => {
                    setInputText('');
                    setFileContent('');
                    setUploadedFile(null);
                  }}
                >
                  清空
                </Button>
              </Space>
            }
          >
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
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
                        rows={15}
                        style={{ marginBottom: '16px' }}
                      />
                    )
                  },
                  {
                    key: 'file',
                    label: '文件内容预览',
                    children: uploadedFile ? (
                      <div>
                        <Paragraph>
                          <FileTextOutlined /> 当前文件: <strong>{uploadedFile.name}</strong>
                        </Paragraph>
                        <TextArea
                          value={fileContent}
                          onChange={(e) => setFileContent(e.target.value)}
                          rows={13}
                          readOnly={false}
                        />
                      </div>
                    ) : (
                      <div style={{ 
                        textAlign: 'center', 
                        padding: '40px 0',
                        color: '#999'
                      }}>
                        请先上传数据文件
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
                disabled={messages.length === 0}
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
                      color: msg.role === 'user' ? '#1890ff' : '#52c41a'
                    }}>
                      {msg.role === 'user' ? '👤 输入数据' : '🤖 分析结果'}
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
                          fontFamily: 'monospace'
                        }}>
                          {msg.content.length > 500 
                            ? msg.content.substring(0, 500) + '...' 
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
        LLM 根因定位与分析系统 ©{new Date().getFullYear()}
      </Footer>
    </Layout>
  );
};

export default App;