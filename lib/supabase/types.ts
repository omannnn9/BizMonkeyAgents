/**
 * Generated from the live Supabase project (`od-cortex`,
 * pulbklywqhvizbakbadd) via `mcp__Supabase__generate_typescript_types` —
 * no longer hand-written now that the project is live and every migration
 * through 0013_role_boundaries.sql is applied. Regenerate the same way
 * after any future migration that changes a table/function shape.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      action_policies: {
        Row: {
          action_type: string
          classification: string
          updated_at: string
        }
        Insert: {
          action_type: string
          classification: string
          updated_at?: string
        }
        Update: {
          action_type?: string
          classification?: string
          updated_at?: string
        }
        Relationships: []
      }
      agent_runs: {
        Row: {
          agent_id: string
          company_id: string
          cost_usd: number | null
          created_at: string
          id: string
          input: string | null
          latency_ms: number | null
          model: string
          output: string | null
          status: string
          tokens_in: number | null
          tokens_out: number | null
          tool_calls: Json
        }
        Insert: {
          agent_id: string
          // Optional here though `not null` in the database: a BEFORE
          // INSERT trigger (supabase/migrations/0001_init.sql) derives
          // this from the row's own agent_id when omitted — the generator
          // doesn't see triggers, so this is hand-corrected after
          // regenerating from the live schema.
          company_id?: string
          cost_usd?: number | null
          created_at?: string
          id?: string
          input?: string | null
          latency_ms?: number | null
          model: string
          output?: string | null
          status?: string
          tokens_in?: number | null
          tokens_out?: number | null
          tool_calls?: Json
        }
        Update: {
          agent_id?: string
          company_id?: string
          cost_usd?: number | null
          created_at?: string
          id?: string
          input?: string | null
          latency_ms?: number | null
          model?: string
          output?: string | null
          status?: string
          tokens_in?: number | null
          tokens_out?: number | null
          tool_calls?: Json
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      agents: {
        Row: {
          company_id: string
          created_at: string
          department_id: string | null
          id: string
          model: string
          name: string
          persona: string
          role_title: string | null
          scope: string
          status: string
          tools: Json
        }
        Insert: {
          company_id: string
          created_at?: string
          department_id?: string | null
          id?: string
          model?: string
          name: string
          persona?: string
          role_title?: string | null
          scope?: string
          status?: string
          tools?: Json
        }
        Update: {
          company_id?: string
          created_at?: string
          department_id?: string | null
          id?: string
          model?: string
          name?: string
          persona?: string
          role_title?: string | null
          scope?: string
          status?: string
          tools?: Json
        }
        Relationships: [
          {
            foreignKeyName: "agents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agents_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      approvals: {
        Row: {
          action_type: string
          company_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          payload: Json
          proposed_by_agent_id: string
          risk_level: string
          status: string
        }
        Insert: {
          action_type: string
          // Optional here though `not null` in the database: a BEFORE
          // INSERT trigger derives this from proposed_by_agent_id when
          // omitted — see the agent_runs note above.
          company_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          payload?: Json
          proposed_by_agent_id: string
          risk_level?: string
          status?: string
        }
        Update: {
          action_type?: string
          company_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          payload?: Json
          proposed_by_agent_id?: string
          risk_level?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "approvals_action_type_fkey"
            columns: ["action_type"]
            isOneToOne: false
            referencedRelation: "action_policies"
            referencedColumns: ["action_type"]
          },
          {
            foreignKeyName: "approvals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_proposed_by_agent_id_fkey"
            columns: ["proposed_by_agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_type: string
          company_id: string | null
          created_at: string
          id: string
          metadata: Json
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_type: string
          company_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_type?: string
          company_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          config: Json
          created_at: string
          id: string
          industry: string | null
          name: string
          parent_id: string | null
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          industry?: string | null
          name: string
          parent_id?: string | null
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          industry?: string | null
          name?: string
          parent_id?: string | null
          slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "companies_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_members: {
        Row: {
          company_id: string
          controls_approvals: boolean
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          company_id: string
          controls_approvals?: boolean
          created_at?: string
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          company_id?: string
          controls_approvals?: boolean
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      decisions: {
        Row: {
          company_id: string
          created_at: string
          description: string | null
          id: string
          made_by: string | null
          rationale: string | null
          related_task_id: string | null
          title: string
        }
        Insert: {
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          made_by?: string | null
          rationale?: string | null
          related_task_id?: string | null
          title: string
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          made_by?: string | null
          rationale?: string | null
          related_task_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "decisions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_related_task_id_fkey"
            columns: ["related_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          company_id: string
          created_at: string
          id: string
          kind: string | null
          name: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          kind?: string | null
          name: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          kind?: string | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      document_chunks: {
        Row: {
          chunk_index: number
          company_id: string
          content: string
          created_at: string
          document_id: string
          embedding: string | null
          id: string
        }
        Insert: {
          chunk_index: number
          // Optional here though `not null` in the database: a BEFORE
          // INSERT trigger derives this from document_id when omitted —
          // see the agent_runs note above.
          company_id?: string
          content: string
          created_at?: string
          document_id: string
          embedding?: string | null
          id?: string
        }
        Update: {
          chunk_index?: number
          company_id?: string
          content?: string
          created_at?: string
          document_id?: string
          embedding?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_chunks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          company_id: string
          created_at: string
          id: string
          mime_type: string | null
          storage_path: string
          tags: string[]
          title: string
          uploaded_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          mime_type?: string | null
          storage_path: string
          tags?: string[]
          title: string
          uploaded_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          mime_type?: string | null
          storage_path?: string
          tags?: string[]
          title?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      edges: {
        Row: {
          created_at: string
          id: string
          metadata: Json
          relation: string
          source_id: string
          source_type: string
          target_id: string
          target_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          metadata?: Json
          relation: string
          source_id: string
          source_type: string
          target_id: string
          target_type: string
        }
        Update: {
          created_at?: string
          id?: string
          metadata?: Json
          relation?: string
          source_id?: string
          source_type?: string
          target_id?: string
          target_type?: string
        }
        Relationships: []
      }
      goals: {
        Row: {
          company_id: string
          created_at: string
          department_id: string | null
          id: string
          key_results: Json
          objective: string
          parent_goal_id: string | null
          period: string
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          department_id?: string | null
          id?: string
          key_results?: Json
          objective: string
          parent_goal_id?: string | null
          period?: string
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          department_id?: string | null
          id?: string
          key_results?: Json
          objective?: string
          parent_goal_id?: string | null
          period?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "goals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_parent_goal_id_fkey"
            columns: ["parent_goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      memories: {
        Row: {
          archived_at: string | null
          confidence: number
          content: string
          created_at: string
          created_by: string | null
          embedding: string | null
          expires_at: string | null
          id: string
          importance: number
          promoted_from_id: string | null
          scope: string
          scope_id: string | null
          source: string
          source_document_id: string | null
        }
        Insert: {
          archived_at?: string | null
          confidence?: number
          content: string
          created_at?: string
          created_by?: string | null
          embedding?: string | null
          expires_at?: string | null
          id?: string
          importance?: number
          promoted_from_id?: string | null
          scope: string
          scope_id?: string | null
          source?: string
          source_document_id?: string | null
        }
        Update: {
          archived_at?: string | null
          confidence?: number
          content?: string
          created_at?: string
          created_by?: string | null
          embedding?: string | null
          expires_at?: string | null
          id?: string
          importance?: number
          promoted_from_id?: string | null
          scope?: string
          scope_id?: string | null
          source?: string
          source_document_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "memories_promoted_from_id_fkey"
            columns: ["promoted_from_id"]
            isOneToOne: false
            referencedRelation: "memories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memories_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          company_id: string
          created_at: string
          department_id: string | null
          id: string
          name: string
          owner_agent_id: string | null
          status: string
        }
        Insert: {
          company_id: string
          created_at?: string
          department_id?: string | null
          id?: string
          name: string
          owner_agent_id?: string | null
          status?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          department_id?: string | null
          id?: string
          name?: string
          owner_agent_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_owner_agent_id_fkey"
            columns: ["owner_agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_agent_id: string | null
          company_id: string
          created_at: string
          description: string | null
          due_at: string | null
          id: string
          priority: string
          project_id: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_agent_id?: string | null
          company_id: string
          created_at?: string
          description?: string | null
          due_at?: string | null
          id?: string
          priority?: string
          project_id?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_agent_id?: string | null
          company_id?: string
          created_at?: string
          description?: string | null
          due_at?: string | null
          id?: string
          priority?: string
          project_id?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_agent_id_fkey"
            columns: ["assigned_agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      match_cross_company_memories: {
        Args: { p_limit?: number; p_min_similarity?: number }
        Returns: {
          company_a_id: string
          company_a_name: string
          company_b_id: string
          company_b_name: string
          memory_a_content: string
          memory_a_id: string
          memory_b_content: string
          memory_b_id: string
          similarity: number
        }[]
      }
      match_document_chunks: {
        Args: {
          p_company_ids: string[]
          p_limit?: number
          p_query_embedding: string
        }
        Returns: {
          chunk_index: number
          content: string
          document_id: string
          id: string
          similarity: number
        }[]
      }
      match_memories: {
        Args: {
          p_agent_id?: string
          p_company_ids: string[]
          p_limit?: number
          p_query_embedding: string
        }
        Returns: {
          confidence: number
          content: string
          created_at: string
          id: string
          importance: number
          scope: string
          scope_id: string
          similarity: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
