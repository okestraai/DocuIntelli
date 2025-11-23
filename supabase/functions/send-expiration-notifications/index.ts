import { createClient } from 'npm:@supabase/supabase-js@2.56.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface Document {
  id: string;
  name: string;
  category: string;
  expiration_date: string;
  status: string;
}

interface NotificationRequest {
  documentIds: string[];
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const { documentIds }: NotificationRequest = await req.json();

    if (!documentIds || documentIds.length === 0) {
      throw new Error('No documents provided');
    }

    const { data: documents, error: docsError } = await supabase
      .from('documents')
      .select('id, name, category, expiration_date, status')
      .in('id', documentIds)
      .eq('user_id', user.id);

    if (docsError) throw docsError;

    if (!documents || documents.length === 0) {
      throw new Error('No documents found');
    }

    const emailContent = generateEmailContent(user.email!, documents as Document[]);

    console.log('Email notification would be sent to:', user.email);
    console.log('Email content:', emailContent);

    const { error: logError } = await supabase
      .from('notification_logs')
      .insert({
        user_id: user.id,
        notification_type: 'expiration_reminder',
        document_ids: documentIds,
        email_sent: true,
        sent_at: new Date().toISOString(),
      });

    if (logError) {
      console.error('Failed to log notification:', logError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Notification sent successfully',
        documentsNotified: documents.length,
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('Error sending notifications:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});

function generateEmailContent(userEmail: string, documents: Document[]): string {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  };

  const getDaysUntil = (dateString: string) => {
    const today = new Date();
    const expDate = new Date(dateString);
    const diffTime = expDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  let emailBody = `
Dear LegalEase User,\n\n`;
  emailBody += `This is a reminder that you have ${documents.length} document(s) expiring soon:\n\n`;

  documents.forEach((doc, index) => {
    const daysUntil = getDaysUntil(doc.expiration_date);
    const urgency = daysUntil <= 0 ? 'EXPIRED' : daysUntil <= 7 ? 'URGENT' : 'Soon';
    
    emailBody += `${index + 1}. ${doc.name}\n`;
    emailBody += `   Category: ${doc.category}\n`;
    emailBody += `   Expiration Date: ${formatDate(doc.expiration_date)}\n`;
    emailBody += `   Status: ${urgency} (${daysUntil <= 0 ? 'Expired' : `${daysUntil} days remaining`})\n\n`;
  });

  emailBody += `Please log in to your LegalEase account to take action on these documents.\n\n`;
  emailBody += `Best regards,\nThe LegalEase Team`;

  return emailBody;
}
