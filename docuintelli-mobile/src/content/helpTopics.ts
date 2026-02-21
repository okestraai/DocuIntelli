import { ElementType } from 'react';
import {
  Upload,
  MessageSquare,
  FileText,
  CreditCard,
  Shield,
  Settings,
} from 'lucide-react-native';
import { colors } from '../theme/colors';

export interface HelpQuestion {
  question: string;
  answer: string;
}

export interface HelpTopic {
  id: string;
  title: string;
  icon: ElementType;
  iconColor: string;
  iconBg: string;
  questions: HelpQuestion[];
}

export const HELP_TOPICS: HelpTopic[] = [
  {
    id: 'uploading',
    title: 'Uploading Documents',
    icon: Upload,
    iconColor: colors.primary[600],
    iconBg: colors.primary[50],
    questions: [
      { question: 'How do I upload a document?', answer: 'Tap the Upload button on the dashboard or vault screen. You can choose a file from your device, capture with camera, enter a URL, or type/paste text content directly.' },
      { question: 'What file types are supported?', answer: 'We support PDF, PNG, JPG, JPEG, GIF, WebP, DOC, DOCX, TXT, and RTF files. Maximum file size is 10MB per document.' },
      { question: 'How long does processing take?', answer: 'Most documents are processed within 30 seconds to 2 minutes. Complex or large documents may take slightly longer. You\'ll see a processing indicator on the document.' },
      { question: 'What counts toward my upload limit?', answer: 'Each successful document upload counts as one upload toward your monthly quota. Failed uploads do not count. URL and text imports also count as uploads.' },
    ],
  },
  {
    id: 'ai-chat',
    title: 'AI Chat & Questions',
    icon: MessageSquare,
    iconColor: colors.info[600],
    iconBg: colors.info[50],
    questions: [
      { question: 'How does AI chat work?', answer: 'Our AI analyzes your document content to answer questions. You can ask about specific details, request summaries, or compare information across documents using Global Chat.' },
      { question: 'How accurate are the AI responses?', answer: 'The AI provides answers based strictly on your document content. It cites specific sources and indicates confidence levels. Always verify critical information with the original document.' },
      { question: 'What counts as an AI question?', answer: 'Each message you send in document chat or global chat counts as one AI question. Follow-up questions in the same conversation each count separately.' },
      { question: 'When do my AI questions reset?', answer: 'Free plan AI questions reset daily at midnight UTC. Starter and Pro plans have unlimited AI questions.' },
    ],
  },
  {
    id: 'documents',
    title: 'Document Management',
    icon: FileText,
    iconColor: colors.primary[600],
    iconBg: colors.teal[50],
    questions: [
      { question: 'How do I organize my documents?', answer: 'Documents are automatically categorized (insurance, warranty, lease, employment, contract, other). You can also add custom tags and edit metadata for better organization.' },
      { question: 'Can I download my documents?', answer: 'Yes, you can view and download the original file for any document. Tap the document to view details, then use the download or share option.' },
      { question: 'What happens when I delete a document?', answer: 'Deleted documents are permanently removed along with their AI embeddings and chat history. This action cannot be undone, so please be careful.' },
      { question: 'How do expiration reminders work?', answer: 'If you set an expiration date, you\'ll receive email reminders at 30, 14, and 7 days before expiration. You can manage notification preferences in Settings.' },
    ],
  },
  {
    id: 'billing',
    title: 'Billing & Subscriptions',
    icon: CreditCard,
    iconColor: colors.warning[600],
    iconBg: colors.warning[50],
    questions: [
      { question: 'How do I upgrade my plan?', answer: 'Go to Settings > Billing > Subscription tab. Select your desired plan and follow the Stripe checkout process. Upgrades take effect immediately with prorated billing.' },
      { question: 'How do I cancel my subscription?', answer: 'Go to Settings > Billing and tap "Cancel Subscription". Your plan remains active until the end of the current billing period. You can reactivate anytime before that.' },
      { question: 'What happens if I downgrade?', answer: 'Downgrades take effect at the end of your current billing period. If you exceed the new plan\'s document limit, you\'ll need to select which documents to keep.' },
      { question: 'Can I get a refund?', answer: 'We offer prorated refunds for annual plans within the first 14 days. Monthly plans are not refundable but you can cancel anytime to prevent future charges.' },
    ],
  },
  {
    id: 'security',
    title: 'Security & Privacy',
    icon: Shield,
    iconColor: colors.error[600],
    iconBg: colors.error[50],
    questions: [
      { question: 'How is my data encrypted?', answer: 'All data is encrypted at rest using AES-256 encryption and in transit using TLS 1.2+. Documents are stored securely in isolated cloud storage with row-level security.' },
      { question: 'Who can access my documents?', answer: 'Only you can access your documents. Our system uses row-level security (RLS) to ensure complete data isolation between users. Support staff cannot view your documents.' },
      { question: 'Is my data used to train AI?', answer: 'No. Your documents and chat history are never used to train AI models. All AI processing is done in real-time using your data only for your own queries.' },
      { question: 'How do I delete my account?', answer: 'Go to Settings > Security > Danger Zone. Type DELETE to confirm. This permanently removes all your data, documents, and account information.' },
    ],
  },
  {
    id: 'account',
    title: 'Account & Settings',
    icon: Settings,
    iconColor: colors.slate[600],
    iconBg: colors.slate[100],
    questions: [
      { question: 'How do I change my display name?', answer: 'Go to Settings > Edit Profile. Update your display name and tap Save Changes.' },
      { question: 'How do I manage notifications?', answer: 'Go to Settings > Notifications. Toggle each category on/off to control what emails you receive. Critical security emails are always sent.' },
      { question: 'How do I reset my password?', answer: 'Go to Settings > Security and use "Send Reset Email Instead" to receive a password reset link, or enter your current and new passwords to change it directly.' },
    ],
  },
];
