// @ts-ignore -- needed for latex.js module
import React from 'react';
import { useState, useEffect, useRef } from 'react';
import {
  Book,
  GraduationCap,
  FileText,
  TestTube2,
  Lightbulb,
  Menu,
  X,
  LogOut,
  SendHorizontal,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  RotateCw,
  ListChecks,
  FileText as FileTextIcon,
  Calendar,
  Upload,
  CheckCircle,
  XCircle,
  Video,
  Youtube,
  Link,
  BookOpen,
  Globe,
  FileType,
  Plus,
  File,
  Copy,
  FileUp,
  Download,
  FileCheck,
  Sparkles,
  Clipboard
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/auth';
import { useNavigate } from 'react-router-dom';
import DocumentManager from './DocumentManager';
import axios from 'axios';
import { BubbleChat } from 'flowise-embed-react';
import * as pdfjsLib from 'pdfjs-dist';

// Set the worker source for pdf.js using a CDN
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

// Add at the top before imports
declare global {
  interface Window {
    generatePDF: (latexCode: string) => void;
    renderLaTeXToPDF: (latexCode: string) => boolean;
    pdfMake: any; // Add pdfMake declaration
    renderPDF: (content: string, title: string) => boolean;
  }
}

interface Flashcard {
  question: string;
  answer: string;
  explanation: string;
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
  xml: string;
  questions?: QuizQuestion[];
}

interface StudentAnswer {
  questionId: string;
  selectedOption: number;
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

interface GradeReport {
  topic: string;
  grades: {
    taskGrade: Array<{
      id: string;
      score: string;
      feedback: string;
    }>;
  };
  overallFeedback: string;
  finalScore: string;
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
const LogoIcon = () => (
  <img src="/iter3.svg" alt="Logo" className="w-8 h-8 text-blue-500" />
);

const RobotIcon = () => (
  <img src="/robo1.svg" alt="Robot" className="w-8 h-8 text-blue-500" />
);

const PenIcon = () => (
  <img src="/stil1.svg" alt="Pen" className="w-8 h-8 text-blue-500" />
);

const DocumentIcon = () => (
  <img src="/carte 1.svg" alt="Document" className="w-8 h-8 text-blue-500" />
);

const AssignmentIcon = ({ className = "w-8 h-8 text-blue-500" }: { className?: string }) => (
  <img src="/assig 1.svg" alt="Assignment" className={className} />
);

// Add TestIcon component with the other icon components
const TestIcon = ({ className = "w-8 h-8 text-blue-500" }: { className?: string }) => (
  <img src="/test 1.svg" alt="Test" className={className} />
);

const SelfStudyIcon = ({ className = "w-8 h-8 text-blue-500" }: { className?: string }) => (
  <img src="/self study1.svg" alt="Self Study" className={className} />
);

// Keep the original menuItems structure but update the icons
const menuItems = [
  //{ id: 'self-study', label: 'Self Study', icon: BookOpen },
  { id: 'self-study', label: 'Self Study', icon: SelfStudyIcon },
  { id: 'assignments', label: 'Assignments', icon: AssignmentIcon },
  { id: 'tests', label: 'Tests', icon: TestIcon },
  { id: 'video', label: 'Video Understanding', icon: RobotIcon },
  { id: 'latex', label: 'LaTeX Generator', icon: PenIcon },
];

// After imports, add CSS classes as a React component
const FlashcardStyles = () => (
  <style>
    {`
      .perspective {
        perspective: 1000px;
      }

      .backface-hidden {
        backface-visibility: hidden;
        -webkit-backface-visibility: hidden;
      }

      .card-container {
        transform-style: preserve-3d;
        transition: transform 0.6s;
      }

      .flashcard {
        perspective: 1000px;
        width: 100%;
        height: 400px;
      }

      .flashcard-inner {
        position: relative;
        width: 100%;
        height: 100%;
        text-align: center;
        transition: transform 0.6s;
        transform-style: preserve-3d;
      }

      .flashcard-inner.flipped {
        transform: rotateY(180deg);
      }

      .flashcard-front, .flashcard-back {
        position: absolute;
        width: 100%;
        height: 100%;
        backface-visibility: hidden;
        -webkit-backface-visibility: hidden;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        padding: 2rem;
        border-radius: 0.5rem;
        background-color: white;
      }

      .flashcard-back {
        transform: rotateY(180deg);
        overflow-y: auto;
      }
    `}
  </style>
);

// Replace with a simplified component that doesn't need the script tag
const LaTeXRendererInfo = () => (
  <div className="hidden">LaTeX renderer is enabled using the latex.js package.</div>
);

// Add compileAndDownloadPDF function that uses window.renderPDF
const compileAndDownloadPDF = (latexCode: string) => {
  // Call the renderPDF function
  if (window.renderPDF) {
    window.renderPDF(latexCode, 'LaTeX Document');
  } else {
    alert('PDF renderer is not available.');
  }
};

// Replace LaTeXPreview with a simpler version that doesn't use latexjs
const LaTeXPreview = ({ latexCode }: { latexCode: string }) => {
  return (
    <div className="bg-white border rounded-lg overflow-hidden shadow-sm mb-4">
      <div className="p-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
        <h5 className="font-medium">LaTeX Preview</h5>
      </div>

      <div className="p-4 max-h-[500px] overflow-y-auto">
        <pre className="font-mono text-xs text-gray-800 whitespace-pre-wrap">{latexCode}</pre>
      </div>
    </div>
  );
};

export default function StudentDashboard() {
  const [activeTab, setActiveTab] = useState('self-study');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [studyQuery, setStudyQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeFlashcard, setActiveFlashcard] = useState<number>(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loadingQuizzes, setLoadingQuizzes] = useState(false);
  const [selectedQuiz, setSelectedQuiz] = useState<Quiz | null>(null);
  const [activeQuizStep, setActiveQuizStep] = useState<'list' | 'quiz' | 'results'>('list');
  const [studentAnswers, setStudentAnswers] = useState<StudentAnswer[]>([]);
  const [quizScore, setQuizScore] = useState<number | null>(null);
  const [cardFlipped, setCardFlipped] = useState(false);
  const [cardRotation, setCardRotation] = useState(0);
  const [showExplanation, setShowExplanation] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number>(0);
  const touchEndX = useRef<number>(0);
  const [cardCount, setCardCount] = useState<number>(1);
  const [currentCardIndex, setCurrentCardIndex] = useState<number>(0);
  const [totalProgress, setTotalProgress] = useState<number>(0);
  const [flashcardsVisible, setFlashcardsVisible] = useState<boolean>(false);

  // Assignment states
  const [assignments, setAssignments] = useState<Homework[]>([]);
  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<Homework | null>(null);

  // Assignment submission states
  const [submitMode, setSubmitMode] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [extractedText, setExtractedText] = useState('');
  const [extractionLoading, setExtractionLoading] = useState(false);
  const [submissionLoading, setSubmissionLoading] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [gradeReport, setGradeReport] = useState<GradeReport | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Video understanding states
  const [videoUrl, setVideoUrl] = useState('');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoTask, setVideoTask] = useState<'summarize' | 'transcribe' | 'explain'>('summarize');
  const [videoLanguage, setVideoLanguage] = useState<'en' | 'fr' | 'es' | 'de' | 'ro'>('en');
  const [videoResponse, setVideoResponse] = useState<VideoResponse | null>(null);
  const [isVideoLoading, setIsVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [activeVideoTab, setActiveVideoTab] = useState<'youtube' | 'upload'>('youtube');
  const videoFileInputRef = useRef<HTMLInputElement>(null);

  // LaTeX document generator states
  const [latexFiles, setLatexFiles] = useState<File[]>([]);
  const [latexLanguage, setLatexLanguage] = useState<'en' | 'ro'>('en'); // Default language
  const [latexTask, setLatexTask] = useState<'format' | 'solve' | 'help' | 'explain'>('format'); // Default task
  const [latexResponse, setLatexResponse] = useState<LatexResponse | null>(null);
  const [isLatexLoading, setIsLatexLoading] = useState(false);
  const [latexError, setLatexError] = useState<string | null>(null);
  const [latexPrompt, setLatexPrompt] = useState<string>('');
  const [generatedLatex, setGeneratedLatex] = useState<string>('');
  const latexFileInputRef = useRef<HTMLInputElement>(null);
  const [extractedLatexCode, setExtractedLatexCode] = useState<string>(''); // State to hold extracted latex code


  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const generateFlashcards = async () => {
    setLoading(true);
    setError(null);
    setFlashcards([]);

    try {
      if (!studyQuery.trim()) {
        setError("Please enter a topic for flashcards");
        setLoading(false);
        return;
      }

      const response = await axios.post(
        'https://flow.sprk.ro/api/v1/prediction/8b8b1eb0-a874-4ad4-b42d-33844b73a2b6',
        { question: studyQuery }
      );

      // Extract the flashcard data from the response
      const responseData = response.data;

      // Check if the response contains the text field with JSON data
      if (responseData.text) {
        try {
          // Extract JSON from markdown code blocks if present
          const jsonMatch = responseData.text.match(/```json\s*([\s\S]*?)\s*```/);

          if (jsonMatch && jsonMatch[1]) {
            // Parse the JSON content from inside the code block
            const flashcardData = JSON.parse(jsonMatch[1]);

            // Create a flashcard from the parsed data
            const newFlashcard: Flashcard = {
              question: flashcardData.question,
              answer: flashcardData.answer,
              explanation: flashcardData.explanation
            };

            setFlashcards([newFlashcard]);
            setActiveFlashcard(0);
            setFlashcardsVisible(true);
          } else {
            // Try to parse the text directly as JSON
            const flashcardData = JSON.parse(responseData.text);

            const newFlashcard: Flashcard = {
              question: flashcardData.question,
              answer: flashcardData.answer,
              explanation: flashcardData.explanation
            };

            setFlashcards([newFlashcard]);
            setActiveFlashcard(0);
            setFlashcardsVisible(true);
          }
        } catch (parseError) {
          console.error("Error parsing flashcard data:", parseError);
          setError("Failed to parse flashcard data. Received: " + responseData.text);
        }
      }
      // Handle the case where the API response structure contains the data in the agentReasoning field
      else if (responseData.agentReasoning) {
        try {
          // Find the JsonAnki agent messages
          const jsonAnkiAgent = responseData.agentReasoning.find(
            (agent: any) => agent.agentName === "JsonAnki"
          );

          if (jsonAnkiAgent && jsonAnkiAgent.messages && jsonAnkiAgent.messages.length > 0) {
            // Extract the JSON from the message, which might be wrapped in markdown code blocks
            const message = jsonAnkiAgent.messages[0];
            const jsonMatch = message.match(/```json\s*([\s\S]*?)\s*```/);

            if (jsonMatch && jsonMatch[1]) {
              // Parse the JSON content
              const flashcardData = JSON.parse(jsonMatch[1]);

              const newFlashcard: Flashcard = {
                question: flashcardData.question,
                answer: flashcardData.answer,
                explanation: flashcardData.explanation
              };

              setFlashcards([newFlashcard]);
              setActiveFlashcard(0);
              setFlashcardsVisible(true);
              resetCard();
            } else {
              setError("Failed to extract flashcard data from response");
            }
          } else {
            setError("No flashcard data found in the response");
          }
        } catch (parseError) {
          console.error("Error parsing agent reasoning data:", parseError);
          setError("Failed to parse agent reasoning data");
        }
      } else {
        setError("Unexpected response format from AI service");
      }

    } catch (error) {
      console.error("Error generating flashcards:", error);
      setError("Failed to generate flashcards. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  const toggleAnswer = () => {
    if (showExplanation) {
      setShowExplanation(false);
      return;
    }

    if (!cardFlipped) {
      setCardRotation(cardRotation + 180);
      setCardFlipped(true);
    } else {
      setShowExplanation(true);
    }
  };

  const resetCard = () => {
    setCardFlipped(false);
    setShowExplanation(false);
    setCardRotation(0);
  };

  const nextFlashcard = () => {
    if (activeFlashcard < flashcards.length - 1) {
      resetCard();
      setActiveFlashcard(activeFlashcard + 1);
    }
  };

  const prevFlashcard = () => {
    if (activeFlashcard > 0) {
      resetCard();
      setActiveFlashcard(activeFlashcard - 1);
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    const swipeThreshold = 50;
    const swipeDistance = touchEndX.current - touchStartX.current;

    if (swipeDistance > swipeThreshold) {
      // Swiped right - go to previous card
      prevFlashcard();
    } else if (swipeDistance < -swipeThreshold) {
      // Swiped left - go to next card
      nextFlashcard();
    } else if (Math.abs(swipeDistance) < 20) {
      // Tap - flip the card
      toggleAnswer();
    }
  };

  useEffect(() => {
    if (activeTab === 'tests') {
      fetchQuizzes();
    }
  }, [activeTab]);

  const fetchQuizzes = async () => {
    try {
      setLoadingQuizzes(true);
      const response = await axios.get('http://localhost:5020/api/quizzes');

      if (response.data && response.data.success) {
        // Parse the quizzes and their XML
        const parsedQuizzes = response.data.quizzes.map((quiz: Quiz) => {
          return {
            ...quiz,
            questions: parseQuizXml(quiz.xml)?.questions || []
          };
        });

        setQuizzes(parsedQuizzes);
      }
    } catch (error) {
      console.error('Error fetching quizzes:', error);
    } finally {
      setLoadingQuizzes(false);
    }
  };

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

  const startQuiz = (quiz: Quiz) => {
    setSelectedQuiz(quiz);
    setActiveQuizStep('quiz');
    setStudentAnswers([]);
    setQuizScore(null);
  };

  const handleOptionSelect = (questionId: string, optionIndex: number) => {
    // Check if an answer for this question already exists
    const existingAnswerIndex = studentAnswers.findIndex(a => a.questionId === questionId);

    if (existingAnswerIndex >= 0) {
      // Update existing answer
      const updatedAnswers = [...studentAnswers];
      updatedAnswers[existingAnswerIndex] = {
        questionId,
        selectedOption: optionIndex
      };
      setStudentAnswers(updatedAnswers);
    } else {
      // Add new answer
      setStudentAnswers([
        ...studentAnswers,
        {
          questionId,
          selectedOption: optionIndex
        }
      ]);
    }
  };

  const submitQuiz = () => {
    if (!selectedQuiz || !selectedQuiz.questions) return;

    // Calculate the score
    let correctAnswers = 0;

    selectedQuiz.questions.forEach((question) => {
      const studentAnswer = studentAnswers.find(a => a.questionId === question.id);

      if (studentAnswer) {
        const selectedOption = question.options[studentAnswer.selectedOption];
        if (selectedOption && selectedOption.correct) {
          correctAnswers++;
        }
      }
    });

    // Calculate score out of 10
    const totalScore = (correctAnswers / selectedQuiz.questions.length) * 10;
    setQuizScore(parseFloat(totalScore.toFixed(1)));

    // Show results
    setActiveQuizStep('results');
  };

  const resetQuiz = () => {
    setSelectedQuiz(null);
    setActiveQuizStep('list');
    setStudentAnswers([]);
    setQuizScore(null);
  };

  // Add this useEffect for assignments
  useEffect(() => {
    if (activeTab === 'assignments') {
      fetchAssignments();
    }
  }, [activeTab]);

  const fetchAssignments = async () => {
    try {
      setLoadingAssignments(true);
      const response = await axios.get('http://localhost:5020/api/assignments');

      if (response.data && response.data.success) {
        // Parse the assignments and their XML
        const parsedAssignments = response.data.assignments.map((assignment: any) => {
          return {
            ...assignment,
            ...parseAssignmentXml(assignment.xml)
          };
        });

        setAssignments(parsedAssignments);
      }
    } catch (error) {
      console.error('Error fetching assignments:', error);
    } finally {
      setLoadingAssignments(false);
    }
  };

  const parseAssignmentXml = (xmlString: string): Partial<Homework> => {
    try {
      // Extract the XML content using regex
      const xmlPattern = /<homework>[\s\S]*?<\/homework>/;
      const match = xmlString.match(xmlPattern);

      if (!match) {
        return {};
      }

      const cleanXml = match[0];
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(cleanXml, 'application/xml');

      // Check for parsing errors
      if (xmlDoc.getElementsByTagName('parsererror').length > 0) {
        return {};
      }

      // Extract homework components
      const topic = xmlDoc.querySelector('topic')?.textContent || '';
      const title = xmlDoc.querySelector('title')?.textContent || '';
      const description = xmlDoc.querySelector('description')?.textContent || '';
      const submissionInstructions = xmlDoc.querySelector('submissionInstructions')?.textContent || '';

      // Extract tasks
      const tasks: HomeworkTask[] = [];

      const taskElements = xmlDoc.querySelectorAll('task');
      taskElements.forEach((taskEl) => {
        const taskData: HomeworkTask = {
          id: taskEl.getAttribute('id') || '',
          text: taskEl.querySelector('text')?.textContent || ''
        };

        tasks.push(taskData);
      });

      return {
        topic,
        title,
        description,
        tasks,
        submissionInstructions
      };
    } catch (error) {
      console.error('Error parsing assignment XML:', error);
      return {};
    }
  };

  const handlePdfSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile && selectedFile.type === 'application/pdf') {
      setPdfFile(selectedFile);
      setSubmissionError(null);
      extractPdfText(selectedFile);
    } else {
      setSubmissionError('Please select a valid PDF file');
      setPdfFile(null);
    }
  };

  const extractPdfText = async (file: File) => {
    try {
      setExtractionLoading(true);
      setSubmissionError(null);

      // Convert the PDF file to an ArrayBuffer
      const arrayBuffer = await file.arrayBuffer();

      // Load the PDF document
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

      let fullText = '';

      // Extract text from each page
      const totalPages = pdf.numPages;

      for (let i = 1; i <= totalPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(' ');
        fullText += pageText + '\n\n';
      }

      setExtractedText(fullText.trim());
    } catch (error) {
      console.error('Error extracting text from PDF:', error);
      setSubmissionError('Failed to extract text from PDF');
    } finally {
      setExtractionLoading(false);
    }
  };

  const submitAssignment = async () => {
    if (!selectedAssignment || !extractedText) {
      setSubmissionError('Please provide both assignment and submission content');
      return;
    }

    try {
      setSubmissionLoading(true);
      setSubmissionError(null);
      setGradeReport(null);

      // Call the grader API with the assignment XML and extracted text
      const response = await axios.post(
        'https://flow.sprk.ro/api/v1/prediction/d821033b-489f-44d7-89cc-1ad91e0db352',
        {
          question: JSON.stringify({
            homework: selectedAssignment.xml,
            submission: extractedText
          })
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 30000
        }
      );

      console.log("Grader API response:", response.data);

      // Extract the XML content from the response
      let xmlContent = '';
      if (response.data && response.data.text) {
        xmlContent = response.data.text;
      }

      if (!xmlContent) {
        throw new Error('No XML content found in response');
      }

      // Parse the XML content
      const parsedGradeReport = parseGradeXml(xmlContent);
      console.log("Parsed grade report:", parsedGradeReport);

      if (parsedGradeReport) {
        setGradeReport(parsedGradeReport);
      } else {
        throw new Error('Failed to parse grading report XML');
      }

    } catch (error: any) {
      console.error('Error submitting assignment:', error);
      setSubmissionError(`Failed to submit assignment: ${error.message || 'Unknown error'}`);
    } finally {
      setSubmissionLoading(false);
    }
  };

  const parseGradeXml = (xmlString: string): GradeReport | null => {
    try {
      // Find the XML content if it's within other text
      const xmlPattern = /<gradingReport>[\s\S]*?<\/gradingReport>/;
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

      // Extract the report components
      const topic = xmlDoc.querySelector('topic')?.textContent || '';
      const overallFeedback = xmlDoc.querySelector('overallFeedback')?.textContent || '';
      const finalScore = xmlDoc.querySelector('finalScore')?.textContent || '';

      // Extract task grades
      const taskGrades: Array<{id: string; score: string; feedback: string}> = [];

      const taskGradeElements = xmlDoc.querySelectorAll('taskGrade');
      taskGradeElements.forEach((gradeEl) => {
        const id = gradeEl.getAttribute('id') || '';
        const score = gradeEl.querySelector('score')?.textContent || '';
        const feedback = gradeEl.querySelector('feedback')?.textContent || '';

        taskGrades.push({
          id,
          score,
          feedback
        });
      });

      return {
        topic,
        grades: {
          taskGrade: taskGrades
        },
        overallFeedback,
        finalScore
      };
    } catch (error) {
      console.error('Error parsing grade XML:', error);
      return null;
    }
  };

  const resetSubmission = () => {
    setPdfFile(null);
    setExtractedText('');
    setSubmitMode(false);
    setGradeReport(null);
    setSubmissionError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Process YouTube URL
  const handleYoutubeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!videoUrl.trim()) {
      setVideoError('Please enter a YouTube URL');
      return;
    }

    setIsVideoLoading(true);
    setVideoError(null);
    setVideoResponse(null);

    try {
      // Format exactly matching the API schema
      const requestBody = {
        url: videoUrl,
        language: videoLanguage,
        task: videoTask
      };

      console.log('Sending YouTube API request:', requestBody);

      // Use axios with JSON content type
      const response = await axios({
        method: 'post',
        url: 'http://localhost:8000/upload/youtube/',
        data: requestBody,
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 300000 // 5 minutes timeout
      });

      console.log('YouTube API response:', response.data);

      setVideoResponse({
        success: true,
        response: response.data.response,
        url: videoUrl,
        video_id: response.data.extracted_video_id
      });
    } catch (err: any) {
      console.error('Error processing YouTube video:', err);
      console.error('Request error details:', err.response?.data);

      let errorMessage = 'An error occurred processing the video';

      // Extract detailed error message from the API response if available
      if (err.response?.data?.detail) {
        if (Array.isArray(err.response.data.detail)) {
          // Handle array of error details
          errorMessage = err.response.data.detail.map((detail: any) =>
            `${detail.loc.join('.')} - ${detail.msg}`
          ).join('; ');
        } else {
          // Handle string error message
          errorMessage = err.response.data.detail;
        }
      } else if (err.message) {
        errorMessage = err.message;
      }

      setVideoError(errorMessage);
    } finally {
      setIsVideoLoading(false);
    }
  };

  // Handle video file upload
  const handleVideoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    if (file && file.type.startsWith('video/')) {
      setVideoFile(file);
      setVideoError(null);
    } else {
      setVideoFile(null);
      setVideoError('Please select a valid video file');
    }
  };

  // Upload and process video file
  const handleVideoUpload = async () => {
    if (!videoFile) {
      setVideoError('Please select a video file');
      return;
    }

    setIsVideoLoading(true);
    setVideoError(null);
    setVideoResponse(null);

    try {
      const formData = new FormData();
      formData.append('video', videoFile);
      formData.append('language', videoLanguage);
      formData.append('task', videoTask);

      const response = await axios.post(
        'http://localhost:8000/upload/video/',
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 600000 // 10 minutes timeout for video processing
        }
      );

      setVideoResponse({
        success: true,
        response: response.data.response,
        filename: videoFile.name,
        content_type: videoFile.type
      });
    } catch (err: any) {
      console.error('Error processing video file:', err);
      setVideoError(err.response?.data?.detail?.[0]?.msg || err.message || 'An error occurred');
    } finally {
      setIsVideoLoading(false);
    }
  };

  // Reset video states
  const resetVideo = () => {
    setVideoUrl('');
    setVideoFile(null);
    setVideoResponse(null);
    setVideoError(null);
    if (videoFileInputRef.current) {
      videoFileInputRef.current.value = '';
    }
  };

  // Handler for LaTeX file selection
  const handleLatexFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Convert FileList to array and store
    const filesArray = Array.from(files);
    setLatexFiles(filesArray);
    setLatexError(null);
  };

  // Handle LaTeX file upload - MODIFIED
  const handleLatexUpload = async () => {
    if (latexFiles.length === 0) {
      setLatexError('Please select at least one file');
      return;
    }

    setIsLatexLoading(true);
    setLatexError(null);
    setLatexResponse(null);
    setExtractedLatexCode(''); // Clear previous extracted code

    try {
      const formData = new FormData();

      // Append each file to FormData with the same field name 'files'
      latexFiles.forEach(file => {
        formData.append('files', file);
      });
      formData.append('language', latexLanguage); // Add language
      formData.append('task', latexTask);       // Add task

      const response = await axios.post(
        'http://localhost:8001/uploadfiles/', // Updated endpoint and port
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 120000 // 2 minutes timeout for processing
        }
      );

      if (response.data && response.data.latex_code) { // Check for latex_code in response
        setLatexResponse(response.data);

        // Extract LaTeX code from response.data.latex_code and handle ```latex ... ```
        const rawLatex = response.data.latex_code;
        const latexMatch = rawLatex.match(/```latex\s*([\s\S]*?)\s*```/);
        if (latexMatch && latexMatch[1]) {
          setExtractedLatexCode(latexMatch[1].trim()); // Extract and set latex code
        } else {
          setExtractedLatexCode(rawLatex.trim()); // If no code block, use the whole response
        }

      } else {
        throw new Error('Invalid response from server: No latex_code found');
      }
    } catch (err: any) {
      console.error('Error processing LaTeX files:', err);
      setLatexError(err.response?.data?.detail?.[0]?.msg || err.message || 'An error occurred');
    } finally {
      setIsLatexLoading(false);
    }
  };


  // Reset LaTeX states - MODIFIED to clear extractedLatexCode
  const resetLatex = () => {
    setLatexFiles([]);
    setLatexResponse(null);
    setLatexError(null);
    setLatexPrompt('');
    setGeneratedLatex('');
    setExtractedLatexCode(''); // Clear extracted latex code
    if (latexFileInputRef.current) {
      latexFileInputRef.current.value = '';
    }
  };

  // Generate LaTeX from a prompt
  const generateLatexFromPrompt = async () => {
    if (!latexPrompt.trim()) {
      setLatexError('Please enter a prompt');
      return;
    }

    setIsLatexLoading(true);
    setLatexError(null);
    setGeneratedLatex('');

    try {
      const formData = new URLSearchParams();
      formData.append('latex_code', latexPrompt);

      const response = await axios.post(
        'http://localhost:8001/generate-pdf/',
        formData,
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          responseType: 'blob' // Changed to blob since it returns a PDF file
        }
      );

      // Create a download link for the PDF
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'generated.pdf');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      setGeneratedLatex(latexPrompt); // Store the original LaTeX code
    } catch (err: any) {
      console.error('Error generating LaTeX:', err);
      setLatexError(err.response?.data?.detail?.[0]?.msg || err.message || 'An error occurred');
    } finally {
      setIsLatexLoading(false);
    }
  };

  // Download PDF function
  const downloadPDF = async (latexCode: string) => {
    try {
      const formData = new URLSearchParams();
      formData.append('latex_code', latexCode);

      const response = await axios.post(
        'http://localhost:8001/generate-pdf/',
        formData,
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          responseType: 'blob'
        }
      );

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'document.pdf');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('Error downloading PDF:', err);
      setLatexError(err.response?.data?.detail?.[0]?.msg || err.message || 'An error occurred');
    }
  };

  return (
    <>
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
              <p className="text-sm text-gray-500 mt-1">Student Portal</p>
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
          ${!isSidebarOpen ? 'lg:ml-0' : ''}
        `}>
          <FlashcardStyles />

          {/* Self Study Tab */}
          {activeTab === 'self-study' && (
            <div className="p-8">
              <h1 className="text-2xl font-bold text-gray-800 mb-6">Self Study</h1>

              <div className="glass-card p-6 mb-6">
                <h2 className="text-xl font-semibold mb-4">Generate Flashcards</h2>
                <p className="text-sm text-gray-600 mb-4">
                  Enter a topic you want to study, and we'll generate flashcards to help you learn.
                </p>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Topic</label>
                    <input
                      type="text"
                      value={studyQuery}
                      onChange={(e) => setStudyQuery(e.target.value)}
                      placeholder="Java OOP, History of World War II, Photosynthesis..."
                      className="w-full p-3 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="flex justify-end">
                    <Button
                      onClick={generateFlashcards}
                      disabled={loading || !studyQuery.trim()}
                      className="flex items-center"
                    >
                      {loading ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Lightbulb className="w-4 h-4 mr-2" />
                          Generate Flashcards
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>

              {error && (
                <div className="bg-red-50 text-red-700 p-4 mb-6 rounded-md flex items-start">
                  <AlertCircle className="w-5 h-5 mr-2 mt-0.5 flex-shrink-0" />
                  <p>{error}</p>
                </div>
              )}

              {flashcards.length > 0 && flashcardsVisible && (
                <div className="mt-8">
                  {/* Flashcard carousel */}
                  <div className="flex justify-center">
                    <div
                      className="glass-card p-6 w-full max-w-2xl flashcard-container"
                      onTouchStart={handleTouchStart}
                      onTouchMove={handleTouchMove}
                      onTouchEnd={handleTouchEnd}
                    >
                      <div className="flashcard">
                        <div className={`flashcard-inner ${showAnswer ? 'flipped' : ''}`}>
                          <div className="flashcard-front">
                            <h3 className="text-xl font-bold mb-8">Question</h3>
                            <p className="text-lg">{flashcards[activeFlashcard]?.question}</p>

                            <button
                              onClick={() => setShowAnswer(true)}
                              className="mt-8 text-blue-500 hover:text-blue-700 font-medium"
                            >
                              Show Answer
                            </button>
                          </div>
                          <div className="flashcard-back">
                            <h3 className="text-xl font-bold mb-4">Answer</h3>
                            <p className="text-lg mb-6">{flashcards[activeFlashcard]?.answer}</p>

                            {flashcards[activeFlashcard]?.explanation && (
                              <>
                                <h4 className="text-lg font-semibold mb-2">Explanation</h4>
                                <p className="text-base text-gray-700">{flashcards[activeFlashcard]?.explanation}</p>
                              </>
                            )}

                            <button
                              onClick={() => setShowAnswer(false)}
                              className="mt-8 text-blue-500 hover:text-blue-700 font-medium"
                            >
                              Show Question
                            </button>
                          </div>
                        </div>
                      </div>

                      <FlashcardStyles />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Assignments Tab */}
          {activeTab === 'assignments' && (
            <div className="p-8">
              <h1 className="text-2xl font-bold text-gray-800 mb-6">Assignments</h1>

              {!selectedAssignment && (
                <div className="glass-card p-6">
                  <h2 className="text-xl font-semibold mb-4">Available Assignments</h2>

                  {loadingAssignments ? (
                    <div className="flex justify-center py-8">
                      <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
                    </div>
                  ) : assignments.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <FileTextIcon className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                      <p>No assignments available at the moment.</p>
                    </div>
                  ) : (
                    <div className="divide-y">
                      {assignments.map((assignment, index) => (
                        <div key={index} className="py-4 first:pt-0 last:pb-0">
                          <div className="flex justify-between items-start">
                            <div>
                              <h3 className="font-semibold text-lg">{assignment.title}</h3>
                              <p className="text-sm text-gray-500 mb-2">Topic: {assignment.topic}</p>
                              <p className="text-sm mb-3">{assignment.description}</p>

                              <div className="flex text-sm text-gray-500">
                                <div className="flex items-center mr-4">
                                  <ListChecks className="w-4 h-4 mr-1" />
                                  <span>{assignment.tasks?.length || 0} tasks</span>
                                </div>
                                <div className="flex items-center">
                                  <Calendar className="w-4 h-4 mr-1" />
                                  <span>{new Date(assignment.timestamp).toLocaleDateString()}</span>
                                </div>
                              </div>
                            </div>

                            <Button
                              onClick={() => setSelectedAssignment(assignment)}
                              variant="outline"
                              className="mt-2"
                            >
                              View Details
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Assignment Details */}
              {selectedAssignment && !submitMode && (
                <div className="glass-card p-6">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <div className="flex items-center mb-2">
                        <button
                          onClick={() => {
                            setSelectedAssignment(null);
                            setGradeReport(null);
                          }}
                          className="mr-2 text-gray-500 hover:text-gray-700"
                        >
                          <ChevronLeft className="w-5 h-5" />
                        </button>
                        <h2 className="text-xl font-semibold">{selectedAssignment.title}</h2>
                      </div>
                      <p className="text-sm text-gray-500">Topic: {selectedAssignment.topic}</p>
                    </div>
                    <div className="flex items-center text-sm text-gray-500">
                      <Calendar className="w-4 h-4 mr-1" />
                      <span>{new Date(selectedAssignment.timestamp).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <div className="mb-6">
                    <h3 className="font-medium mb-3">Description</h3>
                    <p className="bg-gray-50 p-4 rounded-md">{selectedAssignment.description}</p>
                  </div>

                  <div className="mb-6">
                    <h3 className="font-medium mb-3">Tasks</h3>
                    <div className="space-y-3">
                      {selectedAssignment.tasks?.map((task, index) => (
                        <div key={index} className="bg-gray-50 p-4 rounded-md">
                          <div className="flex items-start">
                            <div className="bg-blue-500 text-white rounded-full w-6 h-6 flex-shrink-0 flex items-center justify-center text-sm mr-3 mt-0.5">
                              {index + 1}
                            </div>
                            <p>{task.text}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mb-6">
                    <h3 className="font-medium mb-3">Submission Instructions</h3>
                    <p className="bg-gray-50 p-4 rounded-md">{selectedAssignment.submissionInstructions}</p>
                  </div>

                  <div className="flex justify-end">
                    <Button
                      onClick={() => setSubmitMode(true)}
                      className="flex items-center"
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      Submit Assignment
                    </Button>
                  </div>
                </div>
              )}

              {/* Submission Form */}
              {selectedAssignment && submitMode && (
                <div className="glass-card p-6">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <div className="flex items-center mb-2">
                        <button
                          onClick={() => resetSubmission()}
                          className="mr-2 text-gray-500 hover:text-gray-700"
                        >
                          <ChevronLeft className="w-5 h-5" />
                        </button>
                        <h2 className="text-xl font-semibold">Submit Assignment</h2>
                      </div>
                      <p className="text-sm text-gray-500">{selectedAssignment.title}</p>
                    </div>
                  </div>

                  {!gradeReport ? (
                    <>
                      <div className="mb-6">
                        <h3 className="font-medium mb-3">Upload Solution</h3>
                        <div className="border-2 border-dashed border-gray-300 rounded-md p-6 text-center">
                          <input
                            type="file"
                            accept="application/pdf"
                            onChange={handlePdfSelect}
                            ref={fileInputRef}
                            className="hidden"
                            id="pdf-file-input"
                          />
                          <label htmlFor="pdf-file-input" className="cursor-pointer">
                            <div className="flex flex-col items-center">
                              <FileTextIcon className="w-12 h-12 text-blue-500 mb-3" />
                              <p className="text-gray-700 mb-1">Click to select PDF file</p>
                              <p className="text-sm text-gray-500">Please upload your solution in PDF format</p>
                            </div>
                          </label>

                          {pdfFile && (
                            <div className="mt-4 text-left bg-gray-50 p-3 rounded-md">
                              <p className="font-medium text-gray-700">{pdfFile.name}</p>
                              <p className="text-sm text-gray-500">{(pdfFile.size / (1024 * 1024)).toFixed(2)} MB</p>

                              {extractionLoading ? (
                                <div className="mt-2 flex items-center text-gray-500">
                                  <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                                  <span>Extracting text...</span>
                                </div>
                              ) : extractedText && (
                                <div className="mt-2">
                                  <p className="text-sm text-gray-700 mb-1">Text successfully extracted</p>
                                  <p className="text-xs text-gray-500">{extractedText.slice(0, 100)}...</p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {submissionError && (
                        <div className="bg-red-50 text-red-700 p-4 mb-6 rounded-md flex items-start">
                          <AlertCircle className="w-5 h-5 mr-2 mt-0.5 flex-shrink-0" />
                          <p>{submissionError}</p>
                        </div>
                      )}

                      <div className="flex justify-end">
                        <Button
                          onClick={submitAssignment}
                          disabled={submissionLoading || !extractedText}
                          className="flex items-center"
                        >
                          {submissionLoading ? (
                            <>
                              <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                              Grading...
                            </>
                          ) : (
                            <>
                              <CheckCircle className="w-4 h-4 mr-2" />
                              Submit for Grading
                            </>
                          )}
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="mb-4">
                      <div className="mb-6 flex items-center justify-between">
                        <h3 className="font-medium">Grading Results</h3>
                        <div className="flex items-center">
                          <span className="font-bold text-lg mr-2">{gradeReport.finalScore}</span>
                          <span className="text-sm text-gray-500">/ 10</span>
                        </div>
                      </div>

                      <div className="mb-6">
                        <h4 className="text-sm font-medium mb-2">Task Evaluations</h4>
                        <div className="space-y-4">
                          {gradeReport.grades.taskGrade.map((grade, index) => (
                            <div key={index} className="bg-gray-50 p-4 rounded-md">
                              <div className="flex justify-between mb-2">
                                <div className="flex items-center">
                                  <div className="bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm mr-3">
                                    {index + 1}
                                  </div>
                                  <h5 className="font-medium">Task {grade.id}</h5>
                                </div>
                                <div className="flex items-center">
                                  <span className="font-bold mr-1">{grade.score}</span>
                                  <span className="text-sm text-gray-500">pts</span>
                                </div>
                              </div>
                              <p className="ml-9 text-sm">{grade.feedback}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="mb-6">
                        <h4 className="text-sm font-medium mb-2">Overall Feedback</h4>
                        <div className="bg-blue-50 border border-blue-100 p-4 rounded-md">
                          <p>{gradeReport.overallFeedback}</p>
                        </div>
                      </div>

                      <div className="flex justify-end">
                        <Button
                          onClick={resetSubmission}
                          variant="outline"
                          className="flex items-center"
                        >
                          <RefreshCw className="w-4 h-4 mr-2" />
                          Start Over
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Tests Tab */}
          {activeTab === 'tests' && (
            <div className="p-8">
              <h1 className="text-2xl font-bold text-gray-800 mb-6">Tests</h1>

              {activeQuizStep === 'list' && (
                <div className="glass-card p-6">
                  <h2 className="text-xl font-semibold mb-4">Available Tests</h2>

                  {loadingQuizzes ? (
                    <div className="flex justify-center py-8">
                      <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
                    </div>
                  ) : quizzes.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <TestTube2 className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                      <p>No tests available at the moment.</p>
                    </div>
                  ) : (
                    <div className="divide-y">
                      {quizzes.map((quiz, index) => (
                        <div key={index} className="py-4 first:pt-0 last:pb-0">
                          <div className="flex justify-between items-start">
                            <div>
                              <h3 className="font-semibold text-lg">Test: {quiz.topic}</h3>
                              <div className="flex text-sm text-gray-500 mt-2">
                                <div className="flex items-center mr-4">
                                  <ListChecks className="w-4 h-4 mr-1" />
                                  <span>{quiz.questions?.length || 0} questions</span>
                                </div>
                                <div className="flex items-center">
                                  <Calendar className="w-4 h-4 mr-1" />
                                  <span>{new Date(quiz.timestamp).toLocaleDateString()}</span>
                                </div>
                              </div>
                            </div>

                            <Button
                              onClick={() => startQuiz(quiz)}
                              variant="outline"
                              className="mt-2"
                            >
                              Start Test
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeQuizStep === 'quiz' && selectedQuiz && (
                <div className="glass-card p-6">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <div className="flex items-center mb-2">
                        <button
                          onClick={resetQuiz}
                          className="mr-2 text-gray-500 hover:text-gray-700"
                        >
                          <ChevronLeft className="w-5 h-5" />
                        </button>
                        <h2 className="text-xl font-semibold">Test: {selectedQuiz.topic}</h2>
                      </div>
                      <p className="text-sm text-gray-500">
                        {selectedQuiz.questions?.length || 0} questions
                      </p>
                    </div>
                  </div>

                  <div className="space-y-8 mb-8">
                    {selectedQuiz.questions?.map((question, qIndex) => {
                      // Find the student's answer for this question
                      const studentAnswer = studentAnswers.find(a => a.questionId === question.id);

                      return (
                        <div key={qIndex} className="bg-gray-50 p-6 rounded-md">
                          <div className="flex items-start mb-4">
                            <div className="bg-blue-500 text-white rounded-full w-7 h-7 flex-shrink-0 flex items-center justify-center text-sm mr-3 mt-0.5">
                              {qIndex + 1}
                            </div>
                            <h3 className="font-medium">{question.text}</h3>
                          </div>

                          <div className="ml-10 space-y-3">
                            {question.options.map((option, oIndex) => (
                              <div
                                key={oIndex}
                                onClick={() => handleOptionSelect(question.id, oIndex)}
                                className={`
                                  p-3 rounded-md cursor-pointer flex items-center border
                                  ${studentAnswer?.selectedOption === oIndex
                                    ? 'border-blue-500 bg-blue-50'
                                    : 'border-gray-200 hover:border-gray-300'
                                  }
                                `}
                              >
                                <div className={`
                                  w-5 h-5 rounded-full border flex-shrink-0 mr-3 flex items-center justify-center
                                  ${studentAnswer?.selectedOption === oIndex
                                    ? 'border-blue-500 bg-blue-500 text-white'
                                    : 'border-gray-300'
                                  }
                                `}>
                                  {studentAnswer?.selectedOption === oIndex && <CheckCircle2 className="w-4 h-4" />}
                                </div>
                                <span>{option.text}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex justify-between items-center pt-4 border-t">
                    <div className="text-sm text-gray-500">
                      <p>{studentAnswers.length} of {selectedQuiz.questions?.length || 0} questions answered</p>
                    </div>

                    <Button
                      onClick={submitQuiz}
                      disabled={studentAnswers.length < (selectedQuiz.questions?.length || 0)}
                      className="flex items-center"
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Submit Answers
                    </Button>
                  </div>
                </div>
              )}

              {activeQuizStep === 'results' && selectedQuiz && (
                <div className="glass-card p-6">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <div className="flex items-center mb-2">
                        <h2 className="text-xl font-semibold">Test Results</h2>
                      </div>
                      <p className="text-sm text-gray-500">
                        {selectedQuiz.topic}
                      </p>
                    </div>

                    <div className="flex items-center">
                      <span className="font-bold text-2xl mr-2">{quizScore}</span>
                      <span className="text-gray-500">/ 10</span>
                    </div>
                  </div>

                  <div className="space-y-6 mb-8">
                    {selectedQuiz.questions?.map((question, qIndex) => {
                      // Find the student's answer for this question
                      const studentAnswer = studentAnswers.find(a => a.questionId === question.id);
                      const selectedOption = studentAnswer ? question.options[studentAnswer.selectedOption] : null;
                      const isCorrect = selectedOption?.correct === true;

                      // Find the correct option
                      const correctOption = question.options.find(o => o.correct);

                      return (
                        <div key={qIndex} className={`
                          p-6 rounded-md border-l-4
                          ${isCorrect ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50'}
                        `}>
                          <div className="flex items-start mb-4">
                            <div className={`
                              rounded-full w-7 h-7 flex-shrink-0 flex items-center justify-center text-white text-sm mr-3 mt-0.5
                              ${isCorrect ? 'bg-green-500' : 'bg-red-500'}
                            `}>
                              {qIndex + 1}
                            </div>
                            <h3 className="font-medium">{question.text}</h3>
                          </div>

                          <div className="ml-10 space-y-3">
                            {question.options.map((option, oIndex) => {
                              const isSelected = studentAnswer?.selectedOption === oIndex;

                              return (
                                <div
                                  key={oIndex}
                                  className={`
                                    p-3 rounded-md flex items-center border
                                    ${option.correct ? 'border-green-500 bg-green-100' : ''}
                                    ${isSelected && !option.correct ? 'border-red-500 bg-red-100' : ''}
                                    ${!isSelected && !option.correct ? 'border-gray-200' : ''}
                                  `}
                                >
                                  <div className={`
                                    w-5 h-5 rounded-full border flex-shrink-0 mr-3 flex items-center justify-center
                                    ${option.correct ? 'border-green-500 bg-green-500 text-white' : ''}
                                    ${isSelected && !option.correct ? 'border-red-500 bg-red-500 text-white' : ''}
                                    ${!isSelected && !option.correct ? 'border-gray-300' : ''}
                                  `}>
                                    {option.correct && <CheckCircle2 className="w-4 h-4" />}
                                    {isSelected && !option.correct && <XCircle className="w-4 h-4" />}
                                  </div>
                                  <span>{option.text}</span>
                                </div>
                              );
                            })}
                          </div>

                          {!isCorrect && (
                            <div className="ml-10 mt-3 text-sm">
                              <p className="text-green-700 font-medium">
                                Correct answer: {correctOption?.text || 'Not available'}
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex justify-end">
                    <Button
                      onClick={resetQuiz}
                      variant="outline"
                      className="flex items-center"
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Back to Tests
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Video Understanding Tab */}
          {activeTab === 'video' && (
            <div className="p-8">
              <h1 className="text-2xl font-bold text-gray-800 mb-6">Video Understanding</h1>

              <div className="glass-card p-6 mb-6">
                <div className="flex space-x-2 mb-6">
                  <button
                    onClick={() => setActiveVideoTab('youtube')}
                    className={`px-4 py-2 rounded-md ${
                      activeVideoTab === 'youtube'
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    <div className="flex items-center">
                      <Youtube className="w-4 h-4 mr-2" />
                      YouTube URL
                    </div>
                  </button>

                  <button
                    onClick={() => setActiveVideoTab('upload')}
                    className={`px-4 py-2 rounded-md ${
                      activeVideoTab === 'upload'
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    <div className="flex items-center">
                      <Upload className="w-4 h-4 mr-2" />
                      Upload Video File
                    </div>
                  </button>
                </div>

                {/* YouTube URL input */}
                {activeVideoTab === 'youtube' && (
                  <div>
                    <h2 className="text-xl font-semibold mb-4">Process YouTube Video</h2>
                    <p className="text-sm text-gray-600 mb-6">
                      Enter a YouTube video URL to analyze its content.
                    </p>

                    <form onSubmit={handleYoutubeSubmit} className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">YouTube URL:</label>
                        <div className="flex">
                          <div className="flex-grow flex items-center border rounded-l-md px-3 bg-gray-50">
                            <Link className="w-5 h-5 text-gray-400" />
                          </div>
                          <input
                            type="url"
                            value={videoUrl}
                            onChange={(e) => setVideoUrl(e.target.value)}
                            placeholder="https://www.youtube.com/watch?v=..."
                            className="flex-1 p-3 border-y border-r rounded-r-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium mb-2">Processing Task:</label>
                          <select
                            value={videoTask}
                            onChange={(e) => setVideoTask(e.target.value as any)}
                            className="w-full p-3 border rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="summarize">Summarize Video</option>
                            <option value="transcribe">Transcribe Content</option>
                            <option value="explain">Explain Video</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm font-medium mb-2">Language:</label>
                          <select
                            value={videoLanguage}
                            onChange={(e) => setVideoLanguage(e.target.value as any)}
                            className="w-full p-3 border rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="en">English</option>
                            <option value="fr">French</option>
                            <option value="es">Spanish</option>
                            <option value="de">German</option>
                            <option value="ro">Romanian</option>
                          </select>
                        </div>
                      </div>

                      <div className="flex justify-end">
                        <Button
                          type="submit"
                          disabled={isVideoLoading || !videoUrl.trim()}
                          className="flex items-center"
                        >
                          {isVideoLoading ? (
                            <>
                              <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                              Processing...
                            </>
                          ) : (
                            <>
                              <Globe className="w-4 h-4 mr-2" />
                              Process YouTube Video
                            </>
                          )}
                        </Button>
                      </div>
                    </form>
                  </div>
                )}

                {/* Video File Upload */}
                {activeVideoTab === 'upload' && (
                  <div>
                    <h2 className="text-xl font-semibold mb-4">Upload Video File</h2>
                    <p className="text-sm text-gray-600 mb-6">
                      Upload a video file from your device to analyze its content.
                    </p>

                    <div className="border-2 border-dashed border-gray-300 rounded-md p-6 text-center mb-6">
                      <input
                        type="file"
                        accept="video/*"
                        onChange={handleVideoFileChange}
                        ref={videoFileInputRef}
                        className="hidden"
                        id="video-file-input"
                      />
                      <label htmlFor="video-file-input" className="cursor-pointer">
                        <div className="flex flex-col items-center">
                          <Video className="w-12 h-12 text-blue-500 mb-3" />
                          <p className="text-gray-700 mb-1">Click to select video file</p>
                          <p className="text-sm text-gray-500">MP4, MOV, AVI, etc.</p>
                        </div>
                      </label>

                      {videoFile && (
                        <div className="mt-4 text-left bg-gray-50 p-3 rounded-md">
                          <p className="font-medium text-gray-700">{videoFile.name}</p>
                          <p className="text-sm text-gray-500">{(videoFile.size / (1024 * 1024)).toFixed(2)} MB</p>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                      <div>
                        <label className="block text-sm font-medium mb-2">Processing Task:</label>
                        <select
                          value={videoTask}
                          onChange={(e) => setVideoTask(e.target.value as any)}
                          className="w-full p-3 border rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="summarize">Summarize Video</option>
                          <option value="transcribe">Transcribe Content</option>
                          <option value="explain">Explain Video</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">Language:</label>
                        <select
                          value={videoLanguage}
                          onChange={(e) => setVideoLanguage(e.target.value as any)}
                          className="w-full p-3 border rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="en">English</option>
                          <option value="fr">French</option>
                          <option value="es">Spanish</option>
                          <option value="de">German</option>
                          <option value="ro">Romanian</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex justify-end space-x-2">
                      {videoFile && (
                        <Button
                          variant="outline"
                          onClick={resetVideo}
                          className="flex items-center"
                        >
                          <X className="w-4 h-4 mr-2" />
                          Clear
                        </Button>
                      )}

                      <Button
                        onClick={handleVideoUpload}
                        disabled={isVideoLoading || !videoFile}
                        className="flex items-center"
                      >
                        {isVideoLoading ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                            Processing...
                          </>
                        ) : (
                          <>
                            <Upload className="w-4 h-4 mr-2" />
                            Upload & Process
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {videoError && (
                <div className="bg-red-50 text-red-700 p-4 mb-6 rounded-md flex items-start">
                  <AlertCircle className="w-5 h-5 mr-2 mt-0.5 flex-shrink-0" />
                  <p>{videoError}</p>
                </div>
              )}

              {/* Display Video Response */}
              {videoResponse && (
                <div className="glass-card p-6">
                  <h2 className="text-xl font-semibold mb-4">Video Analysis Results</h2>

                  <div className="bg-gray-50 p-4 rounded-md mb-6">
                    <div className="flex items-center text-sm text-gray-500 mb-2">
                      {videoResponse.url ? (
                        <div className="flex items-center">
                          <Youtube className="w-4 h-4 mr-1" />
                          <span>YouTube Video</span>
                        </div>
                      ) : (
                        <div className="flex items-center">
                          <Video className="w-4 h-4 mr-1" />
                          <span>{videoResponse.filename}</span>
                        </div>
                      )}
                    </div>

                    <h3 className="font-medium mb-3">Analysis:</h3>
                    <div className="bg-white border rounded-md p-4 max-h-[500px] overflow-y-auto whitespace-pre-wrap">
                      {videoResponse.response}
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      onClick={resetVideo}
                      className="flex items-center"
                    >
                      <RotateCw className="w-4 h-4 mr-2" />
                      Process Another Video
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* LaTeX Generator Tab */}
          {activeTab === 'latex' && (
            <div className="p-8">
              <h1 className="text-2xl font-bold text-gray-800 mb-6">LaTeX Generator</h1>

              <div className="glass-card p-6 mb-6">
                <h2 className="text-xl font-semibold mb-4">Upload LaTeX Files</h2>
                <p className="text-sm text-gray-600 mb-4">
                  Upload your LaTeX files, images, PDFs or videos to process them and generate LaTeX code.
                </p>

                <div className="border-2 border-dashed border-gray-300 rounded-md p-6 text-center mb-4">
                  <input
                    type="file"
                    multiple
                    onChange={handleLatexFileChange}
                    ref={latexFileInputRef}
                    className="hidden"
                    id="latex-file-input"
                    accept=".tex,.latex,.ltx,image/*,application/pdf,video/*" // Accept images, PDFs, videos
                  />
                  <label htmlFor="latex-file-input" className="cursor-pointer">
                    <div className="flex flex-col items-center">
                      <FileTextIcon className="w-12 h-12 text-blue-500 mb-3" />
                      <p className="text-gray-700 mb-1">Click to select files</p>
                      <p className="text-sm text-gray-500">You can select multiple files (Images, PDFs, Videos, LaTeX)</p>
                    </div>
                  </label>

                  {latexFiles.length > 0 && (
                    <div className="mt-4 text-left">
                      <h3 className="font-medium text-sm mb-2">Selected files:</h3>
                      <div className="max-h-40 overflow-y-auto">
                        {latexFiles.map((file, index) => (
                          <div key={index} className="bg-gray-50 p-2 rounded mb-2 text-sm">
                            <p className="font-medium text-gray-700">{file.name}</p>
                            <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(2)} KB</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Language:</label>
                    <select
                      value={latexLanguage}
                      onChange={(e) => setLatexLanguage(e.target.value as any)}
                      className="w-full p-3 border rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="en">English</option>
                      <option value="ro">Romanian</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Task:</label>
                    <select
                      value={latexTask}
                      onChange={(e) => setLatexTask(e.target.value as any)}
                      className="w-full p-3 border rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="format">Format</option>
                      <option value="solve">Solve</option>
                      <option value="help">Help</option>
                      <option value="explain">Explain</option>
                    </select>
                  </div>
                </div>


                <div className="flex justify-end space-x-2">
                  {latexFiles.length > 0 && (
                    <Button
                      variant="outline"
                      onClick={resetLatex}
                      className="flex items-center"
                    >
                      <X className="w-4 h-4 mr-2" />
                      Clear
                    </Button>
                  )}

                  <Button
                    onClick={handleLatexUpload}
                    disabled={isLatexLoading || latexFiles.length === 0}
                    className="flex items-center"
                  >
                    {isLatexLoading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4 mr-2" />
                        Upload & Process
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* LaTeX Preview - MODIFIED to display extractedLatexCode */}
              <div className="glass-card p-6 mb-6">
                <h2 className="text-xl font-semibold mb-4">LaTeX Preview</h2>
                {isLatexLoading ? (
                  <div className="flex justify-center py-8">
                    <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
                  </div>
                ) : latexError ? (
                  <div className="bg-red-50 text-red-700 p-4 mb-6 rounded-md flex items-start">
                    <AlertCircle className="w-5 h-5 mr-2 mt-0.5 flex-shrink-0" />
                    <p>{latexError}</p>
                  </div>
                ) : (
                  <LaTeXPreview latexCode={extractedLatexCode} />
                )}
              </div>


              {/* Prompt based LaTeX generation section - REMOVED */}
              {/*
              <div className="glass-card p-6 mb-6">
                <h2 className="text-xl font-semibold mb-4">Generate LaTeX PDF</h2>
                <p className="text-sm text-gray-600 mb-4">
                  Enter your LaTeX code and generate a PDF document.
                </p>

                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">LaTeX Code:</label>
                  <textarea
                    value={latexPrompt}
                    onChange={(e) => setLatexPrompt(e.target.value)}
                    placeholder="\documentclass{article}
\begin{document}
\title{My Document}
\author{Your Name}
\maketitle
\section{Introduction}
Your content here...
\end{document}"
                    className="w-full p-3 border rounded-md h-64 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex justify-end">
                  <Button
                    onClick={generateLatexFromPrompt}
                    disabled={isLatexLoading || !latexPrompt.trim()}
                    className="flex items-center"
                  >
                    {isLatexLoading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                        Generating PDF...
                      </>
                    ) : (
                      <>
                        <FileUp className="w-4 h-4 mr-2" />
                        Generate PDF
                      </>
                    )}
                  </Button>
                </div>
              </div>
              */}


              {latexError && (
                <div className="bg-red-50 text-red-700 p-4 mb-6 rounded-md flex items-start">
                  <AlertCircle className="w-5 h-5 mr-2 mt-0.5 flex-shrink-0" />
                  <p>{latexError}</p>
                </div>
              )}

              {/* Display LaTeX Response */}
              {latexResponse && (
                <div className="glass-card p-6 mb-6">
                  <h2 className="text-xl font-semibold mb-4">Processed Files</h2>

                  <div className="space-y-4">
                    {latexResponse.saved_files?.map((fileDetail, index) => (
                      <div key={index} className="bg-gray-50 p-4 rounded-md">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium">{fileDetail.filename}</p>
                            {fileDetail.error && (
                              <p className="text-red-500 text-sm">{fileDetail.error}</p>
                            )}
                          </div>
                          {!fileDetail.error && (
                            <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded">Processed</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Display Generated LaTeX */}
              {generatedLatex && (
                <div className="glass-card p-6">
                  <h2 className="text-xl font-semibold mb-4">Generated LaTeX</h2>

                  <div className="mb-6">
                    <h3 className="font-medium mb-2">LaTeX Code</h3>
                    <pre className="bg-gray-900 text-gray-100 p-4 rounded-md overflow-x-auto text-sm">
                      <code>{generatedLatex}</code>
                    </pre>
                  </div>

                  <div className="flex justify-end space-x-3">
                    <Button
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(generatedLatex);
                        alert("LaTeX code copied to clipboard");
                      }}
                      className="flex items-center"
                    >
                      <Clipboard className="w-4 h-4 mr-2" />
                      Copy Code
                    </Button>

                    <Button
                      onClick={() => downloadPDF(generatedLatex)}
                      className="flex items-center"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Download PDF
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Add BubbleChat component */}
      <BubbleChat
        chatflowid="9ffc4511-5216-4454-b256-10c59ddeeddc"
        apiHost="https://flow.sprk.ro"
      />
    </>
  );
}
