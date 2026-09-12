/**
 * Hand-written until a live Supabase project exists — regenerate with
 * `mcp__Supabase__generate_typescript_types` (or `supabase gen types`) once
 * the schema in supabase/migrations/0001_init.sql has actually been applied,
 * and replace this file with the generated output.
 */

type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Database {
  public: {
    Tables: {
      companies: {
        Row: {
          id: string;
          name: string;
          slug: string;
          parent_id: string | null;
          status: "active" | "inactive" | "archived";
          industry: string | null;
          config: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["companies"]["Row"]> & { name: string; slug: string };
        Update: Partial<Database["public"]["Tables"]["companies"]["Row"]>;
        Relationships: [];
      };
      company_members: {
        Row: {
          id: string;
          company_id: string;
          user_id: string;
          role: "owner" | "managing_director" | "member" | "viewer";
          controls_approvals: boolean;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["company_members"]["Row"]> & {
          company_id: string;
          user_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["company_members"]["Row"]>;
        Relationships: [];
      };
      departments: {
        Row: { id: string; company_id: string; name: string; kind: string | null; created_at: string };
        Insert: Partial<Database["public"]["Tables"]["departments"]["Row"]> & {
          company_id: string;
          name: string;
        };
        Update: Partial<Database["public"]["Tables"]["departments"]["Row"]>;
        Relationships: [];
      };
      agents: {
        Row: {
          id: string;
          name: string;
          role_title: string | null;
          company_id: string;
          department_id: string | null;
          scope: "company" | "group" | "project";
          persona: string;
          model: string;
          tools: Json;
          status: "active" | "paused" | "retired";
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["agents"]["Row"]> & { name: string; company_id: string };
        Update: Partial<Database["public"]["Tables"]["agents"]["Row"]>;
        Relationships: [];
      };
      projects: {
        Row: {
          id: string;
          company_id: string;
          department_id: string | null;
          name: string;
          status: "active" | "on_hold" | "completed" | "cancelled";
          owner_agent_id: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["projects"]["Row"]> & { company_id: string; name: string };
        Update: Partial<Database["public"]["Tables"]["projects"]["Row"]>;
        Relationships: [];
      };
      tasks: {
        Row: {
          id: string;
          project_id: string | null;
          company_id: string;
          assigned_agent_id: string | null;
          title: string;
          description: string | null;
          status: "open" | "in_progress" | "blocked" | "done" | "cancelled";
          priority: "low" | "normal" | "high" | "urgent";
          due_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["tasks"]["Row"]> & { company_id: string; title: string };
        Update: Partial<Database["public"]["Tables"]["tasks"]["Row"]>;
        Relationships: [];
      };
      documents: {
        Row: {
          id: string;
          company_id: string;
          storage_path: string;
          title: string;
          mime_type: string | null;
          uploaded_by: string | null;
          tags: string[];
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["documents"]["Row"]> & {
          company_id: string;
          storage_path: string;
          title: string;
        };
        Update: Partial<Database["public"]["Tables"]["documents"]["Row"]>;
        Relationships: [];
      };
      document_chunks: {
        Row: {
          id: string;
          document_id: string;
          company_id: string;
          content: string;
          embedding: string | number[] | null;
          chunk_index: number;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["document_chunks"]["Row"]> & {
          document_id: string;
          content: string;
          chunk_index: number;
        };
        Update: Partial<Database["public"]["Tables"]["document_chunks"]["Row"]>;
        Relationships: [];
      };
      memories: {
        Row: {
          id: string;
          scope: "founder" | "group" | "company" | "department" | "project" | "agent";
          scope_id: string | null;
          content: string;
          embedding: string | number[] | null;
          source_document_id: string | null;
          importance: number;
          confidence: number;
          created_by: string | null;
          created_at: string;
          expires_at: string | null;
          promoted_from_id: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["memories"]["Row"]> & { scope: string; content: string };
        Update: Partial<Database["public"]["Tables"]["memories"]["Row"]>;
        Relationships: [];
      };
      edges: {
        Row: {
          id: string;
          source_type: string;
          source_id: string;
          target_type: string;
          target_id: string;
          relation: string;
          metadata: Json;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["edges"]["Row"]> & {
          source_type: string;
          source_id: string;
          target_type: string;
          target_id: string;
          relation: string;
        };
        Update: Partial<Database["public"]["Tables"]["edges"]["Row"]>;
        Relationships: [];
      };
      decisions: {
        Row: {
          id: string;
          company_id: string;
          title: string;
          description: string | null;
          made_by: string | null;
          rationale: string | null;
          related_task_id: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["decisions"]["Row"]> & { company_id: string; title: string };
        Update: Partial<Database["public"]["Tables"]["decisions"]["Row"]>;
        Relationships: [];
      };
      agent_runs: {
        Row: {
          id: string;
          agent_id: string;
          company_id: string;
          input: string | null;
          output: string | null;
          tool_calls: Json;
          model: string;
          tokens_in: number | null;
          tokens_out: number | null;
          cost_usd: number | null;
          latency_ms: number | null;
          status: "success" | "error" | "pending";
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["agent_runs"]["Row"]> & { agent_id: string; model: string };
        Update: Partial<Database["public"]["Tables"]["agent_runs"]["Row"]>;
        Relationships: [];
      };
      action_policies: {
        Row: {
          action_type: string;
          classification: "automatic" | "approval_required" | "founder_only";
          updated_at: string;
        };
        Insert: Database["public"]["Tables"]["action_policies"]["Row"];
        Update: Partial<Database["public"]["Tables"]["action_policies"]["Row"]>;
        Relationships: [];
      };
      approvals: {
        Row: {
          id: string;
          proposed_by_agent_id: string;
          company_id: string;
          action_type: string;
          payload: Json;
          risk_level: "low" | "medium" | "high";
          status: "pending" | "approved" | "rejected" | "executed" | "failed";
          decided_by: string | null;
          decided_at: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["approvals"]["Row"]> & {
          proposed_by_agent_id: string;
          action_type: string;
        };
        Update: Partial<Database["public"]["Tables"]["approvals"]["Row"]>;
        Relationships: [];
      };
      audit_log: {
        Row: {
          id: string;
          company_id: string | null;
          actor_type: "user" | "agent" | "system";
          actor_id: string | null;
          action: string;
          target_type: string | null;
          target_id: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["audit_log"]["Row"]> & { actor_type: string; action: string };
        Update: Partial<Database["public"]["Tables"]["audit_log"]["Row"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      match_memories: {
        Args: { p_query_embedding: string; p_limit?: number };
        Returns: Array<{
          id: string;
          content: string;
          scope: string;
          scope_id: string | null;
          importance: number;
          confidence: number;
          created_at: string;
          similarity: number;
        }>;
      };
      match_document_chunks: {
        Args: { p_query_embedding: string; p_company_ids: string[]; p_limit?: number };
        Returns: Array<{
          id: string;
          document_id: string;
          content: string;
          chunk_index: number;
          similarity: number;
        }>;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
