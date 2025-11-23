import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface DeleteResponse {
  success: boolean;
  document_id?: string;
  files_deleted?: number;
  error?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  if (req.method !== "DELETE") {
    return new Response(
      JSON.stringify({ success: false, error: "Method not allowed" }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Authorization required" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid or expired token" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const url = new URL(req.url);
    const documentId = url.pathname.split("/").pop();

    if (!documentId) {
      return new Response(
        JSON.stringify({ success: false, error: "Document ID required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`🗑️ Deleting document: ${documentId} for user: ${user.id}`);

    const { data: document, error: docError } = await supabase
      .from("documents")
      .select("id, user_id")
      .eq("id", documentId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (docError) {
      console.error("❌ Error fetching document:", docError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to fetch document" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!document) {
      return new Response(
        JSON.stringify({ success: false, error: "Document not found or unauthorized" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`📁 Fetching file paths for document: ${documentId}`);
    const { data: files, error: filesError } = await supabase
      .from("document_files")
      .select("file_path")
      .eq("document_id", documentId);

    if (filesError) {
      console.error("⚠️ Error fetching files:", filesError);
    }

    let filesDeleted = 0;

    if (files && files.length > 0) {
      console.log(`🗂️ Deleting ${files.length} file(s) from storage...`);

      for (const file of files) {
        try {
          const { error: storageError } = await supabase.storage
            .from("documents")
            .remove([file.file_path]);

          if (storageError) {
            console.error(`⚠️ Error deleting file ${file.file_path}:`, storageError.message);
          } else {
            filesDeleted++;
            console.log(`✅ Deleted file: ${file.file_path}`);
          }
        } catch (err) {
          console.error(`⚠️ Failed to delete file ${file.file_path}:`, err);
        }
      }
    }

    console.log(`🗄️ Deleting document record (will cascade to related tables)...`);
    const { error: deleteError } = await supabase
      .from("documents")
      .delete()
      .eq("id", documentId)
      .eq("user_id", user.id);

    if (deleteError) {
      console.error("❌ Error deleting document:", deleteError);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to delete document",
          details: deleteError.message
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`✅ Document deleted successfully: ${documentId}`);
    console.log(`📊 Summary:`);
    console.log(`   - Storage files deleted: ${filesDeleted}/${files?.length || 0}`);
    console.log(`   - Database records: Cascaded automatically`);

    const response: DeleteResponse = {
      success: true,
      document_id: documentId,
      files_deleted: filesDeleted,
    };

    return new Response(
      JSON.stringify(response),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    console.error("❌ Fatal error:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: "Internal server error",
        details: err.message
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});