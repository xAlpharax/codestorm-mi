import { useState, useEffect, useRef } from 'react';
import {
  Files,
  GraduationCap,
  TestTube2,
  Users,
  Menu,
  X,
  LogOut,
  Calendar,
  Clock,
  Download,
  Share2,
  Trash2,
  AlertCircle,
  FileText,
  File,
  Send,
  ListChecks,
  ChevronLeft,
  CheckCircle2,
  Video,
  FileType,
  XCircle,
  Upload,
  RefreshCw,
  Link,
  BookOpen,
  Globe,
  Plus,
  Copy,
  Save,
  Eye
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/auth';
import { useNavigate } from 'react-router-dom';
import MaterialsList from '@/components/MaterialsList';
import PdfUploader from '@/components/PdfUploader';
import PdfViewer from '@/components/PdfViewer';
import SearchBar from '@/components/SearchBar';
import axios from 'axios';
import * as pdfjsLib from 'pdfjs-dist';

// Set the worker source for pdf.js using a CDN
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

// Add global declaration
declare global {
  interface Window {
    renderPDF: (content: string, title: string) => boolean;
  }
}

// Simple PDF viewer function
if (typeof window !== 'undefined') {
  window.renderPDF = (content: string, title: string = 'LaTeX Document') => {
    try {
      // Open a new window for the PDF
      const newWindow = window.open('', '_blank');
      if (!newWindow) {
        alert('Please allow popups to view the document');
        return false;
      }

      // Add styles and content to make the document look good
      newWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>${title}</title>
            <style>
              body {
                font-family: 'Georgia', 'Times New Roman', Times, serif;
                line-height: 1.5;
                padding: 20px;
                max-width: 800px;
                margin: 0 auto;
                white-space: pre-wrap;
              }
              pre {
                white-space: pre-wrap;
                font-family: 'Courier New', Courier, monospace;
                background-color: #f5f5f5;
                padding: 10px;
                border-radius: 5px;
                overflow-x: auto;
              }
              .controls {
                position: fixed;
                top: 10px;
                right: 10px;
                background: #f3f4f6;
                border: 1px solid #d1d5db;
                border-radius: 4px;
                padding: 10px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                z-index: 1000;
              }
              button {
                background: #4f46e5;
                color: white;
                border: none;
                padding: 5px 10px;
                border-radius: 4px;
                cursor: pointer;
                margin-right: 5px;
              }
              button:hover {
                background: #4338ca;
              }
              h1 {
                color: #1e3a8a;
                border-bottom: 1px solid #e5e7eb;
                padding-bottom: 10px;
              }
            </style>
          </head>
          <body>
            <div class="controls">
              <button onclick="window.print()">Print/Save as PDF</button>
              <button onclick="window.close()">Close</button>
            </div>
            <h1>${title}</h1>
            <pre>${content}</pre>
          </body>
        </html>
      `);

      return true;
    } catch (error) {
      console.error('Error rendering document:', error);
      alert('Error generating document. Please try again.');
      return false;
    }
  };
}

interface Material {
  text: string;
  title: string;
  timestamp: number;
  name?: string;
  key?: string;
  has_pdf?: boolean;
}

interface QuizOption {
  text: string;
  correct: boolean;
}

interface QuizQuestion {
  id: string;
  type: string;
  text: string;
  options: QuizOption[];
}

interface Quiz {
  key: string;
  topic: string;
  timestamp: number;
  questions: QuizQuestion[];
}

interface HomeworkTask {
  id: string;
  text: string;
}

interface Homework {
  key: string;
  topic: string;
  title: string;
  description: string;
  tasks: HomeworkTask[];
  submissionInstructions: string;
  timestamp: number;
  xml: string;
}

interface VideoResponse {
  success: boolean;
  response: string;
  filename?: string;
  content_type?: string;
  url?: string;
  video_id?: string;
}

// Add an interface for LaTeX response
interface LatexResponse {
  message: string;
  saved_files: Array<{
    filename: string;
    content_type: string;
    saved_path: string | null;
    error: string | null;
  }>;
  latex_code: string;
}

// Define SVG components for the icons
const LogoIcon = ({ className = "w-8 h-8 text-blue-500" }: { className?: string }) => (
  <img src="/iter3.svg" alt="Logo" className={className} />
);

const RobotIcon = () => (
  <img src="/robo1.svg" alt="Robot" className="w-8 h-8 text-blue-500" />
);

const PenIcon = () => (
  <img src="/stil1.svg" alt="Pen" className="w-8 h-8 text-blue-500" />
);

const DocumentIcon = ({ className = "w-8 h-8 text-blue-500" }: { className?: string }) => (
  <img src="/carte 1.svg" alt="Document" className={className} />
);

const AssignmentIcon = ({ className = "w-8 h-8 text-blue-500" }: { className?: string }) => (
  <img src="/assig 1.svg" alt="Assignment" className={className} />
);

const TocaIcon = ({ className = "w-8 h-8 text-blue-500" }: { className?: string }) => (
  <img src="/toca 1.svg" alt="Toca" className={className} />
);

const menuItems = [
  { id: 'materials', label: 'Course Materials', icon: DocumentIcon },
  { id: 'assignments', label: 'Assignments', icon: AssignmentIcon },
  //{ id: 'tests', label: 'Tests', icon: GraduationCap },
  { id: 'tests', label: 'Tests', icon: TocaIcon },
  { id: 'video', label: 'Video Understanding', icon: RobotIcon },
  { id: 'latex', label: 'LaTeX Generator', icon: PenIcon },
  // { id: 'students', label: 'Students', icon: Users }, // Removed as requested
];

export default function TeacherDashboard() {
  const navigate = useNavigate();
  const { logout } = useAuthStore();
  const [activeTab, setActiveTab] = useState('materials');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showAddMaterialsForm, setShowAddMaterialsForm] = useState(false);
  const [selectedPdf, setSelectedPdf] = useState<string | null>(null);
  const [pdfs, setPdfs] = useState<Material[]>([]);
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [xmls, setXmls] = useState<Material[]>([]);
  const [addAssignmentMode, setAddAssignmentMode] = useState(false);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [homeworkTasks, setHomeworkTasks] = useState<HomeworkTask[]>([]);
  const [activeQuizIndex, setActiveQuizIndex] = useState<number | null>(null);
  const [activeHomeworkIndex, setActiveHomeworkIndex] = useState<number | null>(null);
  const [createTestMode, setCreateTestMode] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [students, setStudents] = useState<string[]>([]);
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [quizTopic, setQuizTopic] = useState('');
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizError, setQuizError] = useState<string | null>(null);
  const [quizXml, setQuizXml] = useState('');
  const [parsedQuiz, setParsedQuiz] = useState<Quiz | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Assignment states
  const [assignmentTopic, setAssignmentTopic] = useState('');
  const [assignmentLoading, setAssignmentLoading] = useState(false);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const [assignmentXml, setAssignmentXml] = useState('');
  const [parsedAssignment, setParsedAssignment] = useState<Homework | null>(null);
  const [assignmentSaveLoading, setAssignmentSaveLoading] = useState(false);
  const [assignmentSaveSuccess, setAssignmentSaveSuccess] = useState(false);

  // Add state for quizzes/tests from database
  const [loadingQuizzes, setLoadingQuizzes] = useState(false);
  const [showTestList, setShowTestList] = useState(false);
  const [deleteQuizLoading, setDeleteQuizLoading] = useState(false);
  const [deleteQuizError, setDeleteQuizError] = useState<string | null>(null);

  // Add assignment management states
  const [assignments, setAssignments] = useState<Homework[]>([]);
  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [showAssignmentList, setShowAssignmentList] = useState(false);
  const [selectedAssignmentView, setSelectedAssignmentView] = useState<Homework | null>(null);
  const [deleteAssignmentLoading, setDeleteAssignmentLoading] = useState(false);
  const [deleteAssignmentError, setDeleteAssignmentError] = useState<string | null>(null);

  // Video Understanding state variables
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoLoading, setVideoLoading] = useState<boolean>(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [videoResponse, setVideoResponse] = useState<VideoResponse | null>(null);
  const [videoTask, setVideoTask] = useState<string>('summarize');
  const [outputLanguage, setOutputLanguage] = useState<string>('english');

  // LaTeX Generator state variables
  const [latexPrompt, setLatexPrompt] = useState<string>('');
  const [latexLoading, setLatexLoading] = useState<boolean>(false);
  const [latexError, setLatexError] = useState<string | null>(null);
  const [latexResponse, setLatexResponse] = useState<LatexResponse | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  // Add selectedQuizView state
  const [selectedQuizView, setSelectedQuizView] = useState<Quiz | null>(null);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Existing function handlers
  const handleMaterialSelect = (material: Material | null) => {
    if (material) {
      setSelectedMaterial(material);
    }
  };

  const handleUploadComplete = () => {
    setRefreshKey(prev => prev + 1);
  };

  // Video handlers
  const handleVideoUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setVideoUrl(e.target.value);
  };

  const handleVideoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setVideoFile(e.target.files[0]);
    }
  };

  const handleVideoTaskChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setVideoTask(e.target.value);
  };

  const handleOutputLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setOutputLanguage(e.target.value);
  };

  const handleProcessVideo = async () => {
    setVideoLoading(true);
    setVideoError(null);
    setVideoResponse(null);

    const formData = new FormData();
    formData.append('task', videoTask);
    formData.append('output_language', outputLanguage);

    try {
      let response;

      if (videoUrl) {
        formData.append('video_url', videoUrl);
        response = await axios.post('http://10.0.12.9:8000/upload/youtube/', formData);
      } else if (videoFile) {
        formData.append('video_file', videoFile);
        response = await axios.post('http://10.0.12.9:8000/upload/video/', formData);
      } else {
        throw new Error('Please provide either a video URL or upload a video file.');
      }

      // Extract the actual text content from the API response
      const responseText = response.data.response || response.data;

      setVideoResponse({
        success: true,
        response: responseText,
        url: videoUrl,
        filename: videoFile?.name
      });
    } catch (error) {
      console.error('Error processing video:', error);
      setVideoError(error instanceof Error ? error.message : 'An unknown error occurred');
    } finally {
      setVideoLoading(false);
    }
  };

  // LaTeX handlers
  const handleLatexPromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setLatexPrompt(e.target.value);
  };

  const handleGenerateLatex = async () => {
    if (!latexPrompt.trim()) {
      setLatexError('Please provide a prompt for the LaTeX document.');
      return;
    }

    setLatexLoading(true);
    setLatexError(null);
    setLatexResponse(null);

    try {
      const response = await axios.post('http://10.0.12.9:8001/generate-latex/', {
        prompt: latexPrompt
      });
      setLatexResponse(response.data);
    } catch (error) {
      console.error('Error generating LaTeX:', error);
      setLatexError(error instanceof Error ? error.message : 'An unknown error occurred');
    } finally {
      setLatexLoading(false);
    }
  };

  const downloadLatexFile = () => {
    if (!latexResponse) return;

    const element = document.createElement('a');
    const file = new Blob([latexResponse.latex_code], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = 'document.tex';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const copyLatexToClipboard = () => {
    if (!latexResponse) return;

    navigator.clipboard.writeText(latexResponse.latex_code)
      .then(() => {
        alert('LaTeX code copied to clipboard!');
      })
      .catch(err => {
        console.error('Failed to copy: ', err);
      });
  };

  const compileAndDownloadPDF = (latexCode: string) => {
    if (!latexCode) return;

    // Call the PDF renderer function from window object
    if (window.renderPDF) {
      window.renderPDF(latexCode, 'LaTeX Document');
    } else {
      alert('PDF renderer is not available.');
    }
  };

  // LaTeX Preview component
  const LaTeXPreview = ({ latexCode }: { latexCode: string }) => {
    return (
      <div className="mt-4">
        <h3 className="text-lg font-semibold mb-2">LaTeX Preview</h3>
        <div className="p-4 bg-white rounded-md border border-gray-300 min-h-[200px] overflow-auto">
          <pre className="whitespace-pre-wrap font-mono text-sm">{latexCode}</pre>
        </div>
      </div>
    );
  };

  // Quiz generation and management functions
  const handleGenerateQuiz = async () => {
    if (!quizTopic.trim()) {
      setQuizError('Please provide a topic for the quiz.');
      return;
    }

    setQuizLoading(true);
    setQuizError(null);
    setParsedQuiz(null);

    try {
      const response = await axios.post('https://flow.sprk.ro/api/v1/prediction/5d18b69b-b911-4a27-b2dc-2105fd9b42ef', {
        question: quizTopic
      }, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      // Extract quiz data from response
      const quizData = response.data;

      if (!quizData) {
        throw new Error('No data returned from quiz generator');
      }

      // Set the XML content
      setQuizXml(quizData.text || quizData.response || '');

      // Parse the XML to get quiz questions
      const parsedData = parseQuizXml(quizData.text || quizData.response || '');

      if (parsedData && parsedData.questions && parsedData.questions.length > 0) {
        const newQuiz: Quiz = {
          key: Date.now().toString(),
          topic: quizTopic,
          timestamp: Date.now(),
          questions: parsedData.questions
        };

        setParsedQuiz(newQuiz);
        setSaveSuccess(false);
      } else {
        throw new Error('Failed to parse quiz data from response');
      }
    } catch (error) {
      console.error('Error generating quiz:', error);
      setQuizError(error instanceof Error ? error.message : 'An unknown error occurred');
    } finally {
      setQuizLoading(false);
    }
  };

  // Function to parse quiz XML
  const parseQuizXml = (xmlString: string): { topic: string; questions: QuizQuestion[] } | null => {
    try {
      // Extract the XML content using regex
      const xmlPattern = /<test>[\s\S]*?<\/test>/;
      const match = xmlString.match(xmlPattern);

      if (!match) {
        return null;
      }

      const cleanXml = match[0];
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(cleanXml, 'application/xml');

      // Check for parsing errors
      if (xmlDoc.getElementsByTagName('parsererror').length > 0) {
        return null;
      }

      // Extract topic
      const topicElement = xmlDoc.querySelector('topic');
      const topic = topicElement ? topicElement.textContent || '' : '';

      // Extract questions
      const questions: QuizQuestion[] = [];

      const questionElements = xmlDoc.querySelectorAll('question');
      questionElements.forEach((questionEl) => {
        const questionData: QuizQuestion = {
          id: questionEl.getAttribute('id') || '',
          type: questionEl.getAttribute('type') || '',
          text: '',
          options: []
        };

        // Get question text
        const textEl = questionEl.querySelector('text');
        questionData.text = textEl ? textEl.textContent || '' : '';

        // Get options
        const optionElements = questionEl.querySelectorAll('option');
        optionElements.forEach((optionEl) => {
          const isCorrect = optionEl.getAttribute('correct') === 'true';
          const optionText = optionEl.textContent || '';

          questionData.options.push({
            text: optionText,
            correct: isCorrect
          });
        });

        questions.push(questionData);
      });

      return {
        topic,
        questions
      };
    } catch (error) {
      console.error('Error parsing quiz XML:', error);
      return null;
    }
  };

  // Function to save quiz
  const handleSaveQuiz = async () => {
    if (!parsedQuiz || !quizXml) {
      setQuizError('No quiz data to save');
      return;
    }

    setSaveLoading(true);

    try {
      const response = await axios.post('http://10.0.12.9:5020/api/quizzes/save', {
        topic: parsedQuiz.topic,
        xml: quizXml
      });

      if (response.data && response.data.success) {
        setSaveSuccess(true);

        // Add to local state with the key from the server
        const savedQuiz = {
          ...parsedQuiz,
          key: response.data.key
        };

        setQuizzes([savedQuiz, ...quizzes]);

        // Clear form after successful save
        setTimeout(() => {
          setQuizTopic('');
          setParsedQuiz(null);
          setQuizXml('');
          setSaveSuccess(false);
        }, 2000);
      } else {
        throw new Error(response.data?.error || 'Failed to save quiz');
      }
    } catch (error) {
      console.error('Error saving quiz:', error);
      setQuizError(error instanceof Error ? error.message : 'An unknown error occurred');
    } finally {
      setSaveLoading(false);
    }
  };

  // Function to load quizzes
  const loadQuizzes = async () => {
    setLoadingQuizzes(true);

    try {
      const response = await axios.get('http://10.0.12.9:5020/api/quizzes');

      if (response.data && response.data.success) {
        // Parse each quiz's XML to get the questions
        const parsedQuizzes = response.data.quizzes.map((quiz: any) => {
          const parsedData = parseQuizXml(quiz.xml);

          return {
            ...quiz,
            questions: parsedData?.questions || []
          };
        });

        setQuizzes(parsedQuizzes);
      } else {
        throw new Error(response.data?.error || 'Failed to load quizzes');
      }
    } catch (error) {
      console.error('Error loading quizzes:', error);
      setQuizError(error instanceof Error ? error.message : 'An unknown error occurred');
    } finally {
      setLoadingQuizzes(false);
    }
  };

  // Function to delete a quiz
  const handleDeleteQuiz = async (quizKey: string) => {
    if (!window.confirm('Are you sure you want to delete this quiz?')) {
      return;
    }

    setDeleteQuizLoading(true);

    try {
      const response = await axios.post('http://10.0.12.9:5020/api/quizzes/delete', {
        key: quizKey
      });

      if (response.data && response.data.success) {
        // Remove from local state
        setQuizzes(quizzes.filter(quiz => quiz.key !== quizKey));
      } else {
        throw new Error(response.data?.error || 'Failed to delete quiz');
      }
    } catch (error) {
      console.error('Error deleting quiz:', error);
      setDeleteQuizError(error instanceof Error ? error.message : 'An unknown error occurred');
    } finally {
      setDeleteQuizLoading(false);
    }
  };

  // Assignment generation and management functions
  const handleGenerateAssignment = async () => {
    if (!assignmentTopic.trim()) {
      setAssignmentError('Please provide a topic for the assignment.');
      return;
    }

    setAssignmentLoading(true);
    setAssignmentError(null);
    setParsedAssignment(null);

    try {
      const response = await axios.post('https://flow.sprk.ro/api/v1/prediction/b82c8e32-cc8f-47a7-a4fb-d3077ddf3325', {
        question: assignmentTopic
      }, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      // Extract assignment data from response
      const assignmentData = response.data;

      if (!assignmentData) {
        throw new Error('No data returned from assignment generator');
      }

      // Set the XML content
      setAssignmentXml(assignmentData.text || assignmentData.response || '');

      // Parse the XML to get assignment details
      const parsedData = parseAssignmentXml(assignmentData.text || assignmentData.response || '');

      if (parsedData) {
        const newAssignment: Homework = {
          key: Date.now().toString(),
          topic: assignmentTopic,
          title: parsedData.title || `Assignment on ${assignmentTopic}`,
          description: parsedData.description || '',
          tasks: parsedData.tasks || [],
          submissionInstructions: parsedData.submissionInstructions || '',
          timestamp: Date.now(),
          xml: assignmentData.text || assignmentData.response || ''
        };

        setParsedAssignment(newAssignment);
        setAssignmentSaveSuccess(false);
      } else {
        throw new Error('Failed to parse assignment data from response');
      }
    } catch (error) {
      console.error('Error generating assignment:', error);
      setAssignmentError(error instanceof Error ? error.message : 'An unknown error occurred');
    } finally {
      setAssignmentLoading(false);
    }
  };

  // Function to parse assignment XML
  const parseAssignmentXml = (xmlString: string): {
    title: string;
    description: string;
    tasks: HomeworkTask[];
    submissionInstructions: string;
  } | null => {
    try {
      // First, check if the XML is wrapped in markdown code backticks and extract it
      let cleanXmlString = xmlString;

      // Extract content from markdown code blocks
      const markdownMatch = xmlString.match(/```(?:xml)?\n([\s\S]*?)```/);
      if (markdownMatch && markdownMatch[1]) {
        cleanXmlString = markdownMatch[1];
      }

      // Try to match either <homework> or <assignment> tags
      const homeworkPattern = /<homework>[\s\S]*?<\/homework>/;
      const assignmentPattern = /<assignment>[\s\S]*?<\/assignment>/;

      let match = cleanXmlString.match(homeworkPattern) || cleanXmlString.match(assignmentPattern);

      if (!match) {
        console.error('No valid homework or assignment tags found in the response.');
        return null;
      }

      const cleanXml = match[0];
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(cleanXml, 'application/xml');

      // Check for parsing errors
      if (xmlDoc.getElementsByTagName('parsererror').length > 0) {
        console.error('XML parsing error:', xmlDoc.getElementsByTagName('parsererror')[0].textContent);
        return null;
      }

      // Extract title
      const titleElement = xmlDoc.querySelector('title');
      const title = titleElement ? titleElement.textContent || '' : '';

      // Extract description
      const descriptionElement = xmlDoc.querySelector('description');
      const description = descriptionElement ? descriptionElement.textContent || '' : '';

      // Extract submission instructions
      const instructionsElement = xmlDoc.querySelector('submissionInstructions');
      const submissionInstructions = instructionsElement ? instructionsElement.textContent || '' : '';

      // Extract tasks
      const tasks: HomeworkTask[] = [];

      const taskElements = xmlDoc.querySelectorAll('task');
      taskElements.forEach((taskEl, index) => {
        const taskId = taskEl.getAttribute('id') || `task-${index + 1}`;
        const textElement = taskEl.querySelector('text');
        const taskText = textElement ? textElement.textContent || '' : taskEl.textContent || '';

        tasks.push({
          id: taskId,
          text: taskText
        });
      });

      return {
        title,
        description,
        tasks,
        submissionInstructions
      };
    } catch (error) {
      console.error('Error parsing assignment XML:', error);
      return null;
    }
  };

  // Function to save assignment
  const handleSaveAssignment = async () => {
    if (!parsedAssignment || !assignmentXml) {
      setAssignmentError('No assignment data to save');
      return;
    }

    setAssignmentSaveLoading(true);

    try {
      const response = await axios.post('http://10.0.12.9:5020/api/assignments/save', {
        topic: parsedAssignment.topic,
        title: parsedAssignment.title,
        xml: assignmentXml
      });

      if (response.data && response.data.success) {
        setAssignmentSaveSuccess(true);

        // Add to local state with the key from the server
        const savedAssignment = {
          ...parsedAssignment,
          key: response.data.key
        };

        setAssignments([savedAssignment, ...assignments]);

        // Clear form after successful save
        setTimeout(() => {
          setAssignmentTopic('');
          setParsedAssignment(null);
          setAssignmentXml('');
          setAssignmentSaveSuccess(false);
        }, 2000);
      } else {
        throw new Error(response.data?.error || 'Failed to save assignment');
      }
    } catch (error) {
      console.error('Error saving assignment:', error);
      setAssignmentError(error instanceof Error ? error.message : 'An unknown error occurred');
    } finally {
      setAssignmentSaveLoading(false);
    }
  };

  // Function to load assignments
  const loadAssignments = async () => {
    setLoadingAssignments(true);

    try {
      const response = await axios.get('http://10.0.12.9:5020/api/assignments');

      if (response.data && response.data.success) {
        // Parse each assignment's XML to get the details
        const parsedAssignments = response.data.assignments.map((assignment: any) => {
          const parsedData = parseAssignmentXml(assignment.xml);

          return {
            ...assignment,
            title: parsedData?.title || assignment.topic,
            description: parsedData?.description || '',
            tasks: parsedData?.tasks || [],
            submissionInstructions: parsedData?.submissionInstructions || ''
          };
        });

        setAssignments(parsedAssignments);
      } else {
        throw new Error(response.data?.error || 'Failed to load assignments');
      }
    } catch (error) {
      console.error('Error loading assignments:', error);
      setAssignmentError(error instanceof Error ? error.message : 'An unknown error occurred');
    } finally {
      setLoadingAssignments(false);
    }
  };

  // Function to delete an assignment
  const handleDeleteAssignment = async (assignmentKey: string) => {
    if (!window.confirm('Are you sure you want to delete this assignment?')) {
      return;
    }

    setDeleteAssignmentLoading(true);

    try {
      const response = await axios.post('http://10.0.12.9:5020/api/assignments/delete', {
        key: assignmentKey
      });

      if (response.data && response.data.success) {
        // Remove from local state
        setAssignments(assignments.filter(assignment => assignment.key !== assignmentKey));
      } else {
        throw new Error(response.data?.error || 'Failed to delete assignment');
      }
    } catch (error) {
      console.error('Error deleting assignment:', error);
      setDeleteAssignmentError(error instanceof Error ? error.message : 'An unknown error occurred');
    } finally {
      setDeleteAssignmentLoading(false);
    }
  };

  // Load quizzes when the tests tab is activated
  useEffect(() => {
    if (activeTab === 'tests') {
      loadQuizzes();
    }
    if (activeTab === 'assignments') {
      loadAssignments();
    }
  }, [activeTab]);

  const renderTabContent = () => {
    if (activeTab === 'video') {
      return (
        <div className="space-y-6">
          <h1 className="text-2xl font-bold text-gray-800">Video Understanding</h1>
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-lg font-semibold mb-4">Video Analysis</h3>
            <div className="mb-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Select Task</label>
                <select
                  className="w-full p-2 border rounded-md"
                  value={videoTask}
                  onChange={handleVideoTaskChange}
                >
                  <option value="summarize">Summarize</option>
                  <option value="transcribe">Transcribe</option>
                  <option value="explain">Explain</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Output Language</label>
                <select
                  className="w-full p-2 border rounded-md"
                  value={outputLanguage}
                  onChange={handleOutputLanguageChange}
                >
                  <option value="english">English</option>
                  <option value="french">French</option>
                  <option value="spanish">Spanish</option>
                  <option value="german">German</option>
                  <option value="romanian">Romanian</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">YouTube Video URL</label>
                <input
                  type="text"
                  className="w-full p-2 border rounded-md"
                  placeholder="Enter YouTube URL"
                  value={videoUrl}
                  onChange={handleVideoUrlChange}
                />
              </div>

              <div className="border-t border-b py-4 mb-4">
                <p className="text-center font-medium mb-2">OR</p>
                <div className="space-y-2">
                  <label className="block text-sm font-medium mb-1">Upload Video File</label>
                  <input
                    type="file"
                    accept="video/*"
                    className="w-full p-2 border rounded-md"
                    onChange={handleVideoFileChange}
                  />
                </div>
              </div>

              <Button
                className="w-full flex items-center justify-center gap-2"
                onClick={handleProcessVideo}
                disabled={videoLoading || (!videoUrl && !videoFile)}
              >
                {videoLoading ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Process Video
                  </>
                )}
              </Button>

              {videoError && (
                <div className="p-3 bg-red-50 text-red-500 rounded-md flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
                  <p>{videoError}</p>
                </div>
              )}
            </div>

            {videoLoading && (
              <div className="text-center py-8">
                <RefreshCw className="w-12 h-12 animate-spin mx-auto mb-4 text-blue-500" />
                <p className="text-lg font-medium text-gray-800 mb-2">Processing your video...</p>
                <p className="text-sm text-gray-500">This may take several minutes depending on the video length.</p>
              </div>
            )}

            {videoResponse && !videoLoading && (
              <div className="mt-6 p-4 border rounded-md bg-white">
                <h3 className="text-lg font-semibold mb-3">Video Response</h3>
                <div className="space-y-4">
                  {videoResponse.url && (
                    <div className="mb-4">
                      <iframe
                        className="w-full aspect-video rounded-lg mb-3"
                        src={`https://www.youtube.com/embed/${videoResponse.url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/)?.[1] || ''}`}
                        allowFullScreen
                      ></iframe>
                    </div>
                  )}

                  <div>
                    <p className="text-sm font-medium mb-1">Analysis:</p>
                    <div className="p-3 bg-gray-50 rounded-md whitespace-pre-wrap text-gray-700">
                      {videoResponse.response}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }

    if (activeTab === 'latex') {
      return (
        <div className="space-y-6">
          <h1 className="text-2xl font-bold text-gray-800">LaTeX Document Generator</h1>
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-lg font-semibold mb-4">Generate LaTeX Document</h3>
            <div className="mb-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Enter a prompt to generate a LaTeX document
                </label>
                <textarea
                  className="w-full p-2 border rounded-md h-32"
                  placeholder="E.g., Create a math document about calculus with definitions, theorems, and examples."
                  value={latexPrompt}
                  onChange={handleLatexPromptChange}
                />
              </div>

              <Button
                className="w-full flex items-center justify-center gap-2"
                onClick={handleGenerateLatex}
                disabled={latexLoading || !latexPrompt.trim()}
              >
                {latexLoading ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Generate LaTeX
                  </>
                )}
              </Button>

              {latexError && (
                <div className="p-3 bg-red-50 text-red-500 rounded-md flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
                  <p>{latexError}</p>
                </div>
              )}
            </div>

            {latexLoading && (
              <div className="text-center py-8">
                <RefreshCw className="w-12 h-12 animate-spin mx-auto mb-4 text-blue-500" />
                <p className="text-lg font-medium text-gray-800 mb-2">Generating LaTeX document...</p>
                <p className="text-sm text-gray-500">This may take a moment...</p>
              </div>
            )}

            {latexResponse && !latexLoading && (
              <div className="mt-6">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="font-medium text-lg">Generated LaTeX</h4>
                </div>

                <div className="mb-4 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    className="flex items-center gap-1"
                    onClick={downloadLatexFile}
                  >
                    <Download className="h-4 w-4" />
                    Download as .tex
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    className="flex items-center gap-1"
                    onClick={() => compileAndDownloadPDF(latexResponse.latex_code)}
                  >
                    <FileText className="h-4 w-4" />
                    Download as PDF
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    className="flex items-center gap-1"
                    onClick={copyLatexToClipboard}
                  >
                    <Copy className="h-4 w-4" />
                    Copy Code
                  </Button>
                </div>

                <LaTeXPreview latexCode={latexResponse.latex_code} />

                <div className="mt-6 p-3 bg-gray-50 rounded-md mb-4">
                  <h5 className="font-medium mb-3">LaTeX Code:</h5>
                  <pre className="whitespace-pre-wrap text-gray-700 text-sm font-mono border p-3 bg-white rounded max-h-96 overflow-y-auto">
                    {latexResponse.latex_code}
                  </pre>
                </div>

                {latexResponse.saved_files && latexResponse.saved_files.length > 0 && (
                  <div className="mt-4">
                    <h4 className="text-md font-semibold mb-2">Files:</h4>
                    <ul className="space-y-2">
                      {latexResponse.saved_files.map((file, index) => (
                        <li key={index} className="flex items-start gap-2 p-2 bg-gray-50 rounded-md">
                          <File className="h-5 w-5 mt-0.5 text-blue-500" />
                          <div>
                            <p className="font-medium">{file.filename}</p>
                            <p className="text-sm text-gray-500">{file.content_type}</p>
                            {file.error && (
                              <p className="text-sm text-red-500">{file.error}</p>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      );
    }

    if (activeTab === 'assignments') {
      return (
        <div className="space-y-6">
          <h1 className="text-2xl font-bold text-gray-800">Assignments</h1>
          <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2">
            <div className="glass-card p-6">
              <h3 className="font-semibold mb-4">Assignment Generator</h3>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="assignment-topic" className="block text-sm font-medium text-gray-700">
                    Enter Topic
                  </label>
                  <div className="flex">
                    <input
                      type="text"
                      id="assignment-topic"
                      placeholder="e.g., Newton's Laws of Motion"
                      value={assignmentTopic}
                      onChange={(e) => setAssignmentTopic(e.target.value)}
                      className="flex-1 px-4 py-2 border rounded-l-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={handleGenerateAssignment}
                      disabled={assignmentLoading || !assignmentTopic.trim()}
                      className="bg-blue-500 text-white px-4 py-2 rounded-r-md hover:bg-blue-600 disabled:bg-blue-300 flex items-center justify-center"
                    >
                      {assignmentLoading ? (
                        <RefreshCw className="w-5 h-5 animate-spin" />
                      ) : (
                        <Send className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>

                {assignmentError && (
                  <div className="p-3 bg-red-50 text-red-500 rounded-md flex items-start gap-2">
                    <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
                    <p>{assignmentError}</p>
                  </div>
                )}

                {assignmentLoading && (
                  <div className="text-center py-8">
                    <RefreshCw className="w-12 h-12 animate-spin mx-auto mb-4 text-blue-500" />
                    <p className="text-lg font-medium text-gray-800 mb-2">Generating assignment...</p>
                    <p className="text-sm text-gray-500">This may take a moment...</p>
                  </div>
                )}

                {parsedAssignment && !assignmentLoading && (
                  <div className="mt-6 border rounded-md p-4 bg-white">
                    <div className="flex justify-between items-center mb-4">
                      <h4 className="font-medium text-lg">{parsedAssignment.title}</h4>
                      <div className="flex space-x-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex items-center gap-1"
                          onClick={() => setSelectedAssignmentView(parsedAssignment)}
                        >
                          <Eye className="h-4 w-4" />
                          Preview
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex items-center gap-1"
                          onClick={handleSaveAssignment}
                          disabled={assignmentSaveLoading || assignmentSaveSuccess}
                        >
                          {assignmentSaveLoading ? (
                            <RefreshCw className="h-4 w-4 animate-spin" />
                          ) : assignmentSaveSuccess ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          ) : (
                            <Save className="h-4 w-4" />
                          )}
                          {assignmentSaveSuccess ? 'Saved!' : 'Save Assignment'}
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <h5 className="font-semibold text-sm text-gray-700 mb-1">Description</h5>
                        <div className="prose prose-sm max-w-none bg-gray-50 p-3 rounded-md">
                          {parsedAssignment.description.split('\n').map((paragraph, idx) => (
                            paragraph.trim() ? <p key={idx}>{paragraph}</p> : <br key={idx} />
                          ))}
                        </div>
                      </div>

                      <div>
                        <h5 className="font-semibold text-sm text-gray-700 mb-1">Assignment Details</h5>
                        <div className="prose prose-sm max-w-none bg-gray-50 p-3 rounded-md">
                          <ul>
                            <li><strong>Topic:</strong> {parsedAssignment.topic}</li>
                            <li><strong>Created:</strong> {new Date(parsedAssignment.timestamp).toLocaleString()}</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="glass-card p-6 hover:scale-[1.02] transition-transform duration-300">
              <h3 className="font-semibold mb-4">Manage Assignments</h3>
              <p className="text-sm text-gray-500 mb-4">View and edit your existing assignments</p>
              <Button
                className="w-full"
                onClick={() => setShowAssignmentList(!showAssignmentList)}
              >
                {showAssignmentList ? 'Hide Assignments' : 'View Assignments'}
              </Button>

              {showAssignmentList && (
                <div className="mt-4 space-y-4">
                  <div className="flex justify-between items-center mb-2">
                    <h4 className="text-sm font-medium">Your Assignments</h4>
                    <button
                      className="p-1 text-blue-500 hover:text-blue-700"
                      onClick={loadAssignments}
                      disabled={loadingAssignments}
                    >
                      <RefreshCw className={`w-4 h-4 ${loadingAssignments ? 'animate-spin' : ''}`} />
                    </button>
                  </div>

                  {deleteAssignmentError && (
                    <div className="p-3 bg-red-50 text-red-500 rounded-md flex items-start gap-2">
                      <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
                      <p>{deleteAssignmentError}</p>
                    </div>
                  )}

                  {loadingAssignments ? (
                    <div className="text-center py-8 text-gray-500">
                      <RefreshCw className="w-8 h-8 mx-auto mb-2 text-blue-400 animate-spin" />
                      <p>Loading assignments...</p>
                    </div>
                  ) : assignments.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <FileText className="w-10 h-10 mx-auto mb-2 text-gray-400" />
                      <p>No assignments created yet</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {assignments.map((assignment) => (
                        <div key={assignment.key} className="border rounded-md p-3 bg-white hover:shadow-md transition-shadow">
                          <div className="flex justify-between items-start">
                            <div>
                              <h5 className="font-medium">{assignment.title}</h5>
                              <p className="text-sm text-gray-500">
                                {new Date(assignment.timestamp).toLocaleDateString()}
                              </p>
                            </div>
                            <div className="flex gap-1">
                              <button
                                className="p-1 text-blue-500 hover:text-blue-700"
                                onClick={() => setSelectedAssignmentView(assignment)}
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <button
                                className="p-1 text-red-500 hover:text-red-700"
                                onClick={() => handleDeleteAssignment(assignment.key)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {selectedAssignmentView && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                  <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                    <div className="p-6">
                      <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-bold text-blue-700">{selectedAssignmentView.title}</h3>
                        <button
                          className="text-gray-500 hover:text-gray-700"
                          onClick={() => setSelectedAssignmentView(null)}
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                      <div className="space-y-6">
                        <div className="flex items-center space-x-2 text-sm text-gray-500">
                          <Calendar className="w-4 h-4" />
                          <span>Created: {new Date(selectedAssignmentView.timestamp * 1000).toLocaleDateString()} at {new Date(selectedAssignmentView.timestamp * 1000).toLocaleTimeString()}</span>
                        </div>

                        <div className="bg-blue-50 p-4 rounded-md border border-blue-100">
                          <h4 className="font-semibold text-blue-800 mb-2">Assignment Topic</h4>
                          <p className="text-gray-700">{selectedAssignmentView.topic}</p>
                        </div>

                        <div>
                          <h4 className="font-semibold text-gray-800 mb-2 pb-1 border-b">Description</h4>
                          <div className="prose prose-sm max-w-none bg-gray-50 p-4 rounded-md">
                            {selectedAssignmentView.description.split('\n').map((paragraph, idx) => (
                              paragraph.trim() ? <p key={idx} className="mb-2">{paragraph}</p> : <br key={idx} />
                            ))}
                          </div>
                        </div>

                        <div>
                          <h4 className="font-semibold text-gray-800 mb-2 pb-1 border-b">Tasks</h4>
                          <div className="space-y-4">
                            {selectedAssignmentView.tasks.map((task, index) => (
                              <div key={task.id} className="bg-white border border-gray-200 rounded-md p-4 hover:shadow-md transition-shadow">
                                <div className="flex items-start gap-3">
                                  <div className="bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm flex-shrink-0 mt-0.5">
                                    {index + 1}
                                  </div>
                                  <div className="flex-1">
                                    <div className="prose prose-sm max-w-none">
                                      {task.text.split('\n').map((line, lidx) => (
                                        line.trim() ?
                                          <p key={lidx} className="mb-2">{line.trim()}</p> :
                                          <br key={lidx} />
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="bg-yellow-50 p-4 rounded-md border border-yellow-100">
                          <h4 className="font-semibold text-yellow-800 mb-2">Submission Instructions</h4>
                          <div className="prose prose-sm max-w-none">
                            {selectedAssignmentView.submissionInstructions.split('\n').map((line, idx) => (
                              line.trim() ? <p key={idx}>{line}</p> : <br key={idx} />
                            ))}
                          </div>
                        </div>

                        <div className="flex justify-between pt-4 border-t">
                          <Button
                            variant="outline"
                            className="flex items-center gap-2"
                            onClick={() => {
                              navigator.clipboard.writeText(JSON.stringify(selectedAssignmentView, null, 2))
                                .then(() => alert('Assignment details copied to clipboard'))
                                .catch(err => console.error('Failed to copy: ', err));
                            }}
                          >
                            <Copy className="w-4 h-4" />
                            Copy Details
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => setSelectedAssignmentView(null)}
                          >
                            Close
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Assignment Preview Modal */}
          {selectedAssignmentView && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                <div className="p-6">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-blue-700">{selectedAssignmentView.title}</h3>
                    <button
                      className="text-gray-500 hover:text-gray-700"
                      onClick={() => setSelectedAssignmentView(null)}
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="space-y-6">
                    <div className="flex items-center space-x-2 text-sm text-gray-500">
                      <Calendar className="w-4 h-4" />
                      <span>Created: {new Date(selectedAssignmentView.timestamp * 1000).toLocaleDateString()} at {new Date(selectedAssignmentView.timestamp * 1000).toLocaleTimeString()}</span>
                    </div>

                    <div className="bg-blue-50 p-4 rounded-md border border-blue-100">
                      <h4 className="font-semibold text-blue-800 mb-2">Assignment Topic</h4>
                      <p className="text-gray-700">{selectedAssignmentView.topic}</p>
                    </div>

                    <div>
                      <h4 className="font-semibold text-gray-800 mb-2 pb-1 border-b">Description</h4>
                      <div className="prose prose-sm max-w-none bg-gray-50 p-4 rounded-md">
                        {selectedAssignmentView.description.split('\n').map((paragraph, idx) => (
                          paragraph.trim() ? <p key={idx} className="mb-2">{paragraph}</p> : <br key={idx} />
                        ))}
                      </div>
                    </div>

                    <div>
                      <h4 className="font-semibold text-gray-800 mb-2 pb-1 border-b">Tasks</h4>
                      <div className="space-y-4">
                        {selectedAssignmentView.tasks.map((task, index) => (
                          <div key={task.id} className="bg-white border border-gray-200 rounded-md p-4 hover:shadow-md transition-shadow">
                            <div className="flex items-start gap-3">
                              <div className="bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm flex-shrink-0 mt-0.5">
                                {index + 1}
                              </div>
                              <div className="flex-1">
                                <div className="prose prose-sm max-w-none">
                                  {task.text.split('\n').map((line, lidx) => (
                                    line.trim() ?
                                      <p key={lidx} className="mb-2">{line.trim()}</p> :
                                      <br key={lidx} />
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="bg-yellow-50 p-4 rounded-md border border-yellow-100">
                      <h4 className="font-semibold text-yellow-800 mb-2">Submission Instructions</h4>
                      <div className="prose prose-sm max-w-none">
                        {selectedAssignmentView.submissionInstructions.split('\n').map((line, idx) => (
                          line.trim() ? <p key={idx}>{line}</p> : <br key={idx} />
                        ))}
                      </div>
                    </div>

                    <div className="flex justify-between pt-4 border-t">
                      <Button
                        variant="outline"
                        className="flex items-center gap-2"
                        onClick={() => {
                          navigator.clipboard.writeText(JSON.stringify(selectedAssignmentView, null, 2))
                            .then(() => alert('Assignment details copied to clipboard'))
                            .catch(err => console.error('Failed to copy: ', err));
                        }}
                      >
                        <Copy className="w-4 h-4" />
                        Copy Details
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setSelectedAssignmentView(null)}
                      >
                        Close
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    if (activeTab === 'tests') {
      return (
        <div className="space-y-6">
          <h1 className="text-2xl font-bold text-gray-800">Tests</h1>
          <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2">
            <div className="glass-card p-6">
              <h3 className="font-semibold mb-4">Quiz Generator</h3>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="topic" className="block text-sm font-medium text-gray-700">
                    Enter Topic
                  </label>
                  <div className="flex">
                    <input
                      type="text"
                      id="topic"
                      placeholder="e.g., Quasi-linear equations"
                      value={quizTopic}
                      onChange={(e) => setQuizTopic(e.target.value)}
                      className="flex-1 px-4 py-2 border rounded-l-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={handleGenerateQuiz}
                      disabled={quizLoading || !quizTopic.trim()}
                      className="bg-blue-500 text-white px-4 py-2 rounded-r-md hover:bg-blue-600 disabled:bg-blue-300 flex items-center justify-center"
                    >
                      {quizLoading ? (
                        <RefreshCw className="w-5 h-5 animate-spin" />
                      ) : (
                        <Send className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>

                {quizError && (
                  <div className="p-3 bg-red-50 text-red-500 rounded-md flex items-start gap-2">
                    <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
                    <p>{quizError}</p>
                  </div>
                )}

                {quizLoading && (
                  <div className="text-center py-8">
                    <RefreshCw className="w-12 h-12 animate-spin mx-auto mb-4 text-blue-500" />
                    <p className="text-lg font-medium text-gray-800 mb-2">Generating quiz...</p>
                    <p className="text-sm text-gray-500">This may take a moment...</p>
                  </div>
                )}

                {parsedQuiz && !quizLoading && (
                  <div className="mt-6 border rounded-md p-4 bg-white">
                    <div className="flex justify-between items-center mb-4">
                      <h4 className="font-medium text-lg">Quiz: {parsedQuiz.topic}</h4>
                      <div className="flex space-x-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex items-center gap-1"
                          onClick={() => setSelectedQuizView(parsedQuiz)}
                        >
                          <Eye className="h-4 w-4" />
                          Preview
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex items-center gap-1"
                          onClick={handleSaveQuiz}
                          disabled={saveLoading || saveSuccess}
                        >
                          {saveLoading ? (
                            <RefreshCw className="h-4 w-4 animate-spin" />
                          ) : saveSuccess ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          ) : (
                            <Save className="h-4 w-4" />
                          )}
                          {saveSuccess ? 'Saved!' : 'Save Quiz'}
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <p className="text-sm text-gray-500">
                        {parsedQuiz.questions.length} questions generated
                      </p>

                      {parsedQuiz.questions.map((question, qIndex) => (
                        <div key={qIndex} className="bg-gray-50 p-4 rounded-md">
                          <div className="flex items-start gap-3 mb-3">
                            <div className="bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm flex-shrink-0 mt-0.5">
                              {qIndex + 1}
                            </div>
                            <p className="font-medium">{question.text}</p>
                          </div>

                          <div className="ml-9 space-y-2">
                            {question.options.map((option, oIndex) => (
                              <div key={oIndex} className="flex items-center gap-2">
                                <div className={`w-5 h-5 rounded-full flex items-center justify-center border ${
                                  option.correct
                                    ? 'bg-green-100 border-green-500 text-green-500'
                                    : 'border-gray-300'
                                }`}>
                                  {option.correct && <CheckCircle2 className="w-4 h-4" />}
                                </div>
                                <p className={option.correct ? 'font-medium' : ''}>{option.text}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="glass-card p-6 hover:scale-[1.02] transition-transform duration-300">
              <h3 className="font-semibold mb-4">Manage Tests</h3>
              <p className="text-sm text-gray-500 mb-4">View, edit or delete your existing tests</p>
              <Button
                className="w-full"
                onClick={() => setShowTestList(!showTestList)}
              >
                {showTestList ? 'Hide Tests' : 'View Tests'}
              </Button>

              {showTestList && (
                <div className="mt-4 space-y-4">
                  <div className="flex justify-between items-center mb-2">
                    <h4 className="text-sm font-medium">Your Tests</h4>
                    <button
                      className="p-1 text-blue-500 hover:text-blue-700"
                      onClick={loadQuizzes}
                      disabled={loadingQuizzes}
                    >
                      <RefreshCw className={`w-4 h-4 ${loadingQuizzes ? 'animate-spin' : ''}`} />
                    </button>
                  </div>

                  {deleteQuizError && (
                    <div className="p-3 bg-red-50 text-red-500 rounded-md flex items-start gap-2">
                      <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
                      <p>{deleteQuizError}</p>
                    </div>
                  )}

                  {loadingQuizzes ? (
                    <div className="text-center py-8 text-gray-500">
                      <RefreshCw className="w-8 h-8 mx-auto mb-2 text-blue-400 animate-spin" />
                      <p>Loading tests...</p>
                    </div>
                  ) : quizzes.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <FileText className="w-10 h-10 mx-auto mb-2 text-gray-400" />
                      <p>No tests created yet</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {quizzes.map((quiz) => (
                        <div key={quiz.key} className="border rounded-md p-3 bg-white hover:shadow-md transition-shadow">
                          <div className="flex justify-between items-start">
                            <div>
                              <h5 className="font-medium">Quiz: {quiz.topic}</h5>
                              <div className="flex text-sm text-gray-500 mt-1">
                                <div className="flex items-center mr-3">
                                  <ListChecks className="w-4 h-4 mr-1" />
                                  <span>{quiz.questions?.length || 0} questions</span>
                                </div>
                                <div className="flex items-center">
                                  <Calendar className="w-4 h-4 mr-1" />
                                  <span>{new Date(quiz.timestamp).toLocaleDateString()}</span>
                                </div>
                              </div>
                            </div>
                            <div className="flex gap-1">
                              <button
                                className="p-1 text-blue-500 hover:text-blue-700"
                                onClick={() => setSelectedQuizView(quiz)}
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <button
                                className="p-1 text-red-500 hover:text-red-700"
                                onClick={() => handleDeleteQuiz(quiz.key)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Quiz Preview Modal */}
          {selectedQuizView && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                <div className="p-6">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-blue-700">Quiz: {selectedQuizView.topic}</h3>
                    <button
                      className="text-gray-500 hover:text-gray-700"
                      onClick={() => setSelectedQuizView(null)}
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="space-y-6">
                    <div className="flex items-center space-x-2 text-sm text-gray-500">
                      <Calendar className="w-4 h-4" />
                      <span>Created: {new Date(selectedQuizView.timestamp).toLocaleDateString()} at {new Date(selectedQuizView.timestamp).toLocaleTimeString()}</span>
                    </div>

                    <div className="bg-blue-50 p-4 rounded-md border border-blue-100">
                      <h4 className="font-semibold text-blue-800 mb-2">Quiz Overview</h4>
                      <div className="flex flex-wrap gap-4">
                        <div className="bg-white px-3 py-2 rounded-md border border-blue-200">
                          <span className="text-sm text-gray-500">Topic</span>
                          <p className="font-medium">{selectedQuizView.topic}</p>
                        </div>
                        <div className="bg-white px-3 py-2 rounded-md border border-blue-200">
                          <span className="text-sm text-gray-500">Questions</span>
                          <p className="font-medium">{selectedQuizView.questions.length}</p>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h4 className="font-semibold text-gray-800 mb-2 pb-1 border-b">Questions</h4>
                      <div className="space-y-6">
                        {selectedQuizView.questions.map((question, qIndex) => (
                          <div key={qIndex} className="bg-white border border-gray-200 rounded-md p-4 hover:shadow-md transition-shadow">
                            <div className="flex items-start gap-3 mb-4">
                              <div className="bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm flex-shrink-0 mt-0.5">
                                {qIndex + 1}
                              </div>
                              <h5 className="text-lg font-medium">{question.text}</h5>
                            </div>

                            <div className="ml-9 space-y-3">
                              <h6 className="font-medium text-sm text-gray-500">Options:</h6>
                              {question.options.map((option, oIndex) => (
                                <div key={oIndex} className="flex items-center gap-3 p-2 rounded-md bg-gray-50">
                                  <div className={`w-6 h-6 rounded-full flex items-center justify-center border ${
                                    option.correct
                                      ? 'bg-green-100 border-green-500 text-green-500'
                                      : 'border-gray-300'
                                  }`}>
                                    {option.correct ? (
                                      <CheckCircle2 className="w-4 h-4" />
                                    ) : (
                                      <span className="text-xs">{String.fromCharCode(65 + oIndex)}</span>
                                    )}
                                  </div>
                                  <p className={`${option.correct ? 'font-medium' : ''}`}>{option.text}</p>
                                  {option.correct && (
                                    <span className="text-xs text-green-500 bg-green-50 px-2 py-1 rounded-full ml-auto">
                                      Correct Answer
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex justify-between pt-4 border-t">
                      <Button
                        variant="outline"
                        className="flex items-center gap-2"
                        onClick={() => {
                          navigator.clipboard.writeText(JSON.stringify(selectedQuizView, null, 2))
                            .then(() => alert('Quiz details copied to clipboard'))
                            .catch(err => console.error('Failed to copy: ', err));
                        }}
                      >
                        <Copy className="w-4 h-4" />
                        Copy Details
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setSelectedQuizView(null)}
                      >
                        Close
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    // For other tabs, return null to let the main component handle the rendering
    return null;
  };

  return (
    <div className="min-h-screen flex">
      {/* Mobile menu button */}
      <button
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-xl glass glass-hover"
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
      >
        {isSidebarOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Sidebar */}
      <div className={`
        h-screen glass transition-transform duration-300 z-40 shrink-0
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 lg:w-64 w-[240px]
      `}>
        <div className="p-6 flex items-center">
          <LogoIcon />
          <div className="ml-3">
            <h2 className="text-2xl font-bold text-gray-800">SparkAI</h2>
            <p className="text-sm text-gray-500 mt-1">Teacher Portal</p>
          </div>
        </div>

        <nav className="mt-6">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`
                  w-full flex items-center px-6 py-3 text-sm
                  ${activeTab === item.id
                    ? 'bg-blue-500/10 border-r-4 border-blue-500 text-blue-600 backdrop-blur-sm'
                    : 'text-gray-600 hover:bg-white/50 glass-hover'
                  }
                `}
              >
                {typeof Icon === 'function' && !('size' in Icon) ?
                  <Icon /> :
                  <Icon className="w-5 h-5 mr-3" />
                }
                <span className="ml-3">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4">
          <Button
            variant="outline"
            className="w-full justify-start text-red-600 hover:text-red-700"
            onClick={handleLogout}
          >
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className={`
        flex-1 transition-all duration-300 overflow-auto h-screen
      `}>
        <div className="p-8">
          {/* Render content for current tab */}
          {renderTabContent()}

          {/* Materials tab content */}
          {activeTab === 'materials' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-gray-800">Course Materials</h1>
                <div className="w-1/3">
                  <SearchBar onResultSelect={handleMaterialSelect} />
                </div>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <div className="glass-card p-6">
                  <h3 className="font-semibold mb-4">Upload Materials</h3>
                  <PdfUploader onUploadComplete={handleUploadComplete} />

                  <h3 className="font-semibold mb-4 mt-8">Course Materials</h3>
                  <MaterialsList
                    key={refreshKey}
                    onMaterialSelect={handleMaterialSelect}
                  />
                </div>

                <div className="glass-card p-6">
                  {selectedMaterial ? (
                    <div className="space-y-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="text-xl font-semibold mb-2">
                            {selectedMaterial.name || 'Unnamed Document'}
                          </h3>
                          <div className="flex items-center space-x-4 text-sm text-gray-500">
                            <div className="flex items-center">
                              <Calendar className="w-4 h-4 mr-1" />
                              <span>{new Date(selectedMaterial.timestamp).toLocaleDateString()}</span>
                            </div>
                            <div className="flex items-center">
                              <Clock className="w-4 h-4 mr-1" />
                              <span>{new Date(selectedMaterial.timestamp).toLocaleTimeString()}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="prose prose-sm max-w-none max-h-[500px] overflow-y-auto bg-gray-50 p-4 rounded">
                        {selectedMaterial.text && selectedMaterial.text.split('\n').map((paragraph, idx) => (
                          paragraph.trim() ? <p key={idx}>{paragraph}</p> : <br key={idx} />
                        ))}
                        {!selectedMaterial.text && <p className="text-gray-500">No content available</p>}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full py-16 text-center">
                      <Files className="h-16 w-16 text-gray-300 mb-4" />
                      <h3 className="text-lg font-medium text-gray-400 mb-2">No Material Selected</h3>
                      <p className="text-sm text-gray-400">
                        Select a material from the list to view details
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
