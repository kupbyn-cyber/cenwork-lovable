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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      announcement_answers: {
        Row: {
          announcement_id: string
          created_at: string
          id: string
          option_ids: string[]
          question_id: string
          submitted_at: string | null
          text_answer: string | null
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          announcement_id: string
          created_at?: string
          id?: string
          option_ids?: string[]
          question_id: string
          submitted_at?: string | null
          text_answer?: string | null
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          announcement_id?: string
          created_at?: string
          id?: string
          option_ids?: string[]
          question_id?: string
          submitted_at?: string | null
          text_answer?: string | null
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "announcement_answers_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "announcement_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_answers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      announcement_comment_edits: {
        Row: {
          comment_id: string
          created_at: string
          edited_by: string | null
          id: string
          previous_body: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          edited_by?: string | null
          id?: string
          previous_body: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          edited_by?: string | null
          id?: string
          previous_body?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_comment_edits_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "announcement_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_comment_edits_edited_by_fkey"
            columns: ["edited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      announcement_comment_mentions: {
        Row: {
          announcement_id: string
          comment_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          announcement_id: string
          comment_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          announcement_id?: string
          comment_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_comment_mentions_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_comment_mentions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "announcement_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_comment_mentions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      announcement_comments: {
        Row: {
          announcement_id: string
          author_id: string
          body: string
          created_at: string
          hidden_at: string | null
          hidden_by: string | null
          hidden_reason: string | null
          id: string
          is_edited: boolean
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          announcement_id: string
          author_id: string
          body: string
          created_at?: string
          hidden_at?: string | null
          hidden_by?: string | null
          hidden_reason?: string | null
          id?: string
          is_edited?: boolean
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          announcement_id?: string
          author_id?: string
          body?: string
          created_at?: string
          hidden_at?: string | null
          hidden_by?: string | null
          hidden_reason?: string | null
          id?: string
          is_edited?: boolean
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_comments_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_comments_hidden_by_fkey"
            columns: ["hidden_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "announcement_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      announcement_question_options: {
        Row: {
          announcement_id: string
          created_at: string
          id: string
          label: string
          position: number
          question_id: string
        }
        Insert: {
          announcement_id: string
          created_at?: string
          id?: string
          label: string
          position?: number
          question_id: string
        }
        Update: {
          announcement_id?: string
          created_at?: string
          id?: string
          label?: string
          position?: number
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_question_options_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_question_options_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "announcement_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      announcement_questions: {
        Row: {
          announcement_id: string
          content: string
          created_at: string
          id: string
          is_required: boolean
          max_select: number | null
          min_select: number | null
          position: number
          question_type: string
          updated_at: string
          version: number
        }
        Insert: {
          announcement_id: string
          content: string
          created_at?: string
          id?: string
          is_required?: boolean
          max_select?: number | null
          min_select?: number | null
          position?: number
          question_type: string
          updated_at?: string
          version?: number
        }
        Update: {
          announcement_id?: string
          content?: string
          created_at?: string
          id?: string
          is_required?: boolean
          max_select?: number | null
          min_select?: number | null
          position?: number
          question_type?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "announcement_questions_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
        ]
      }
      announcement_recipient_history: {
        Row: {
          acknowledged_at: string | null
          announcement_id: string
          created_at: string
          due_at: string
          exempt_reason: string | null
          first_opened_at: string | null
          id: string
          is_late: boolean
          read_completed_at: string | null
          status: Database["public"]["Enums"]["announcement_recipient_status"]
          user_id: string
          version: number
        }
        Insert: {
          acknowledged_at?: string | null
          announcement_id: string
          created_at?: string
          due_at: string
          exempt_reason?: string | null
          first_opened_at?: string | null
          id?: string
          is_late?: boolean
          read_completed_at?: string | null
          status: Database["public"]["Enums"]["announcement_recipient_status"]
          user_id: string
          version: number
        }
        Update: {
          acknowledged_at?: string | null
          announcement_id?: string
          created_at?: string
          due_at?: string
          exempt_reason?: string | null
          first_opened_at?: string | null
          id?: string
          is_late?: boolean
          read_completed_at?: string | null
          status?: Database["public"]["Enums"]["announcement_recipient_status"]
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "announcement_recipient_history_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_recipient_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      announcement_recipients: {
        Row: {
          acknowledged_at: string | null
          announcement_id: string
          created_at: string
          due_at: string
          exempt_reason: string | null
          first_opened_at: string | null
          id: string
          is_late: boolean
          read_completed_at: string | null
          status: Database["public"]["Enums"]["announcement_recipient_status"]
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          acknowledged_at?: string | null
          announcement_id: string
          created_at?: string
          due_at: string
          exempt_reason?: string | null
          first_opened_at?: string | null
          id?: string
          is_late?: boolean
          read_completed_at?: string | null
          status?: Database["public"]["Enums"]["announcement_recipient_status"]
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          acknowledged_at?: string | null
          announcement_id?: string
          created_at?: string
          due_at?: string
          exempt_reason?: string | null
          first_opened_at?: string | null
          id?: string
          is_late?: boolean
          read_completed_at?: string | null
          status?: Database["public"]["Enums"]["announcement_recipient_status"]
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "announcement_recipients_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_recipients_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      announcement_reminders: {
        Row: {
          announcement_id: string
          created_at: string
          id: string
          kind: string
          user_id: string
          version: number
        }
        Insert: {
          announcement_id: string
          created_at?: string
          id?: string
          kind: string
          user_id: string
          version: number
        }
        Update: {
          announcement_id?: string
          created_at?: string
          id?: string
          kind?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "announcement_reminders_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_reminders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      announcement_revisions: {
        Row: {
          after_data: Json | null
          announcement_id: string
          before_data: Json | null
          created_at: string
          created_by: string | null
          id: string
          reason: string
          version: number
        }
        Insert: {
          after_data?: Json | null
          announcement_id: string
          before_data?: Json | null
          created_at?: string
          created_by?: string | null
          id?: string
          reason: string
          version: number
        }
        Update: {
          after_data?: Json | null
          announcement_id?: string
          before_data?: Json | null
          created_at?: string
          created_by?: string | null
          id?: string
          reason?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "announcement_revisions_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_revisions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      announcement_targets: {
        Row: {
          announcement_id: string
          created_at: string
          id: string
          target_id: string
          target_type: Database["public"]["Enums"]["announcement_target_type"]
        }
        Insert: {
          announcement_id: string
          created_at?: string
          id?: string
          target_id: string
          target_type: Database["public"]["Enums"]["announcement_target_type"]
        }
        Update: {
          announcement_id?: string
          created_at?: string
          id?: string
          target_id?: string
          target_type?: Database["public"]["Enums"]["announcement_target_type"]
        }
        Relationships: [
          {
            foreignKeyName: "announcement_targets_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
        ]
      }
      announcement_versions: {
        Row: {
          announcement_id: string
          body: string
          change_summary: string | null
          comments_enabled: boolean
          created_at: string
          created_by: string | null
          due_at: string | null
          id: string
          reason: string | null
          result_visibility: string
          title: string
          version: number
        }
        Insert: {
          announcement_id: string
          body: string
          change_summary?: string | null
          comments_enabled?: boolean
          created_at?: string
          created_by?: string | null
          due_at?: string | null
          id?: string
          reason?: string | null
          result_visibility?: string
          title: string
          version: number
        }
        Update: {
          announcement_id?: string
          body?: string
          change_summary?: string | null
          comments_enabled?: boolean
          created_at?: string
          created_by?: string | null
          due_at?: string | null
          id?: string
          reason?: string | null
          result_visibility?: string
          title?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "announcement_versions_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          audience_all_teams: boolean
          audience_all_users: boolean
          body: string
          comments_enabled: boolean
          created_at: string
          created_by: string
          current_version: number
          deleted_at: string | null
          due_at: string | null
          id: string
          include_self: boolean
          last_minor_edit_at: string | null
          published_at: string | null
          result_visibility: string
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          status: Database["public"]["Enums"]["announcement_status"]
          title: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          audience_all_teams?: boolean
          audience_all_users?: boolean
          body?: string
          comments_enabled?: boolean
          created_at?: string
          created_by: string
          current_version?: number
          deleted_at?: string | null
          due_at?: string | null
          id?: string
          include_self?: boolean
          last_minor_edit_at?: string | null
          published_at?: string | null
          result_visibility?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          status?: Database["public"]["Enums"]["announcement_status"]
          title?: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          audience_all_teams?: boolean
          audience_all_users?: boolean
          body?: string
          comments_enabled?: boolean
          created_at?: string
          created_by?: string
          current_version?: number
          deleted_at?: string | null
          due_at?: string | null
          id?: string
          include_self?: boolean
          last_minor_edit_at?: string | null
          published_at?: string | null
          result_visibility?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          status?: Database["public"]["Enums"]["announcement_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          created_at: string
          description: string | null
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          created_at?: string
          description?: string | null
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          created_at?: string
          description?: string | null
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_email: string | null
          after_data: Json | null
          before_data: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          metadata: Json
          result: string
          user_id: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json
          result?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json
          result?: string
          user_id?: string | null
        }
        Relationships: []
      }
      daily_reports: {
        Row: {
          author_id: string
          blockers: string | null
          created_at: string
          id: string
          next_plan: string | null
          report_date: string
          results: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewer_id: string | null
          status: Database["public"]["Enums"]["report_status"]
          submitted_at: string | null
          team_id: string | null
          updated_at: string
        }
        Insert: {
          author_id: string
          blockers?: string | null
          created_at?: string
          id?: string
          next_plan?: string | null
          report_date: string
          results?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          submitted_at?: string | null
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          author_id?: string
          blockers?: string | null
          created_at?: string
          id?: string
          next_plan?: string | null
          report_date?: string
          results?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          submitted_at?: string | null
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_reports_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_reports_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_reports_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      deadline_change_requests: {
        Row: {
          created_at: string
          current_deadline: string | null
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          entity_id: string
          entity_type: string
          id: string
          proposed_deadline: string
          reason: string
          requested_by: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_deadline?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          entity_id: string
          entity_type: string
          id?: string
          proposed_deadline: string
          reason: string
          requested_by: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_deadline?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          proposed_deadline?: string
          reason?: string
          requested_by?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deadline_change_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deadline_change_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      document_versions: {
        Row: {
          alt_approver_id: string | null
          approved_at: string | null
          approved_by: string | null
          approver_assigned_at: string | null
          approver_assigned_by: string | null
          approver_id: string | null
          archive_reason: string | null
          archived_at: string | null
          archived_by: string | null
          change_note: string | null
          created_at: string
          created_by: string
          document_id: string
          effective_from: string
          effective_to: string | null
          ever_submitted: boolean
          id: string
          link_reported_at: string | null
          link_reported_by: string | null
          link_resolved_at: string | null
          link_resolved_by: string | null
          link_review_note: string | null
          needs_link_review: boolean
          reject_reason: string | null
          rejected_at: string | null
          rejected_by: string | null
          restore_reason: string | null
          restored_at: string | null
          restored_by: string | null
          self_approval_reason: string | null
          self_approved: boolean
          source_type: Database["public"]["Enums"]["document_source"]
          source_url: string
          status: Database["public"]["Enums"]["document_version_status"]
          status_before_archive:
            | Database["public"]["Enums"]["document_version_status"]
            | null
          submitted_at: string | null
          submitted_by: string | null
          superseded_by_version_id: string | null
          supersedes_version_id: string | null
          updated_at: string
          version_label: string | null
          version_no: number
          withdrawn_at: string | null
          withdrawn_by: string | null
        }
        Insert: {
          alt_approver_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          approver_assigned_at?: string | null
          approver_assigned_by?: string | null
          approver_id?: string | null
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          change_note?: string | null
          created_at?: string
          created_by: string
          document_id: string
          effective_from: string
          effective_to?: string | null
          ever_submitted?: boolean
          id?: string
          link_reported_at?: string | null
          link_reported_by?: string | null
          link_resolved_at?: string | null
          link_resolved_by?: string | null
          link_review_note?: string | null
          needs_link_review?: boolean
          reject_reason?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          restore_reason?: string | null
          restored_at?: string | null
          restored_by?: string | null
          self_approval_reason?: string | null
          self_approved?: boolean
          source_type: Database["public"]["Enums"]["document_source"]
          source_url: string
          status?: Database["public"]["Enums"]["document_version_status"]
          status_before_archive?:
            | Database["public"]["Enums"]["document_version_status"]
            | null
          submitted_at?: string | null
          submitted_by?: string | null
          superseded_by_version_id?: string | null
          supersedes_version_id?: string | null
          updated_at?: string
          version_label?: string | null
          version_no: number
          withdrawn_at?: string | null
          withdrawn_by?: string | null
        }
        Update: {
          alt_approver_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          approver_assigned_at?: string | null
          approver_assigned_by?: string | null
          approver_id?: string | null
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          change_note?: string | null
          created_at?: string
          created_by?: string
          document_id?: string
          effective_from?: string
          effective_to?: string | null
          ever_submitted?: boolean
          id?: string
          link_reported_at?: string | null
          link_reported_by?: string | null
          link_resolved_at?: string | null
          link_resolved_by?: string | null
          link_review_note?: string | null
          needs_link_review?: boolean
          reject_reason?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          restore_reason?: string | null
          restored_at?: string | null
          restored_by?: string | null
          self_approval_reason?: string | null
          self_approved?: boolean
          source_type?: Database["public"]["Enums"]["document_source"]
          source_url?: string
          status?: Database["public"]["Enums"]["document_version_status"]
          status_before_archive?:
            | Database["public"]["Enums"]["document_version_status"]
            | null
          submitted_at?: string | null
          submitted_by?: string | null
          superseded_by_version_id?: string | null
          supersedes_version_id?: string | null
          updated_at?: string
          version_label?: string | null
          version_no?: number
          withdrawn_at?: string | null
          withdrawn_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_versions_alt_approver_id_fkey"
            columns: ["alt_approver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_versions_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_versions_approver_assigned_by_fkey"
            columns: ["approver_assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_versions_approver_id_fkey"
            columns: ["approver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_versions_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_versions_link_reported_by_fkey"
            columns: ["link_reported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_versions_link_resolved_by_fkey"
            columns: ["link_resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_versions_rejected_by_fkey"
            columns: ["rejected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_versions_restored_by_fkey"
            columns: ["restored_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_versions_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_versions_superseded_by_version_id_fkey"
            columns: ["superseded_by_version_id"]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_versions_supersedes_version_id_fkey"
            columns: ["supersedes_version_id"]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_versions_withdrawn_by_fkey"
            columns: ["withdrawn_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          active_version_id: string | null
          archive_reason: string | null
          archived_at: string | null
          archived_by: string | null
          code: string
          created_at: string
          created_by: string
          deleted_at: string | null
          description: string | null
          display_name: string
          doc_type: Database["public"]["Enums"]["document_type"]
          id: string
          keywords: string[]
          latest_version_id: string | null
          name: string
          normalized_name: string
          owner_id: string
          project_id: string | null
          restore_reason: string | null
          restored_at: string | null
          restored_by: string | null
          scope: Database["public"]["Enums"]["document_scope"]
          source_type: Database["public"]["Enums"]["document_source"]
          source_url: string
          team_id: string | null
          updated_at: string
        }
        Insert: {
          active_version_id?: string | null
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          code: string
          created_at?: string
          created_by: string
          deleted_at?: string | null
          description?: string | null
          display_name: string
          doc_type: Database["public"]["Enums"]["document_type"]
          id?: string
          keywords?: string[]
          latest_version_id?: string | null
          name: string
          normalized_name: string
          owner_id: string
          project_id?: string | null
          restore_reason?: string | null
          restored_at?: string | null
          restored_by?: string | null
          scope: Database["public"]["Enums"]["document_scope"]
          source_type: Database["public"]["Enums"]["document_source"]
          source_url: string
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          active_version_id?: string | null
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          code?: string
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          description?: string | null
          display_name?: string
          doc_type?: Database["public"]["Enums"]["document_type"]
          id?: string
          keywords?: string[]
          latest_version_id?: string | null
          name?: string
          normalized_name?: string
          owner_id?: string
          project_id?: string | null
          restore_reason?: string | null
          restored_at?: string | null
          restored_by?: string | null
          scope?: Database["public"]["Enums"]["document_scope"]
          source_type?: Database["public"]["Enums"]["document_source"]
          source_url?: string
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_active_version_fk"
            columns: ["active_version_id"]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_latest_version_fk"
            columns: ["latest_version_id"]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_restored_by_fkey"
            columns: ["restored_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      facilities: {
        Row: {
          address: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          address: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          address?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      mvp_award_results: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          award_score: number | null
          award_type: Database["public"]["Enums"]["mvp_award_type"]
          created_at: string
          cycle_id: string
          evidence: Json
          id: string
          published_at: string | null
          reason: string | null
          recipient_id: string | null
          status: Database["public"]["Enums"]["mvp_award_status"]
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          award_score?: number | null
          award_type: Database["public"]["Enums"]["mvp_award_type"]
          created_at?: string
          cycle_id: string
          evidence?: Json
          id?: string
          published_at?: string | null
          reason?: string | null
          recipient_id?: string | null
          status?: Database["public"]["Enums"]["mvp_award_status"]
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          award_score?: number | null
          award_type?: Database["public"]["Enums"]["mvp_award_type"]
          created_at?: string
          cycle_id?: string
          evidence?: Json
          id?: string
          published_at?: string | null
          reason?: string | null
          recipient_id?: string | null
          status?: Database["public"]["Enums"]["mvp_award_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mvp_award_results_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mvp_award_results_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "mvp_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mvp_award_results_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mvp_cycle_tasks: {
        Row: {
          created_at: string
          cycle_id: string
          final_status: Database["public"]["Enums"]["task_status"] | null
          id: string
          is_committed: boolean
          is_locked: boolean
          original_deadline: string | null
          task_id: string
          updated_at: string
          user_id: string
          weight: number
          weight_confirmed_at: string | null
          weight_confirmed_by: string | null
        }
        Insert: {
          created_at?: string
          cycle_id: string
          final_status?: Database["public"]["Enums"]["task_status"] | null
          id?: string
          is_committed?: boolean
          is_locked?: boolean
          original_deadline?: string | null
          task_id: string
          updated_at?: string
          user_id: string
          weight?: number
          weight_confirmed_at?: string | null
          weight_confirmed_by?: string | null
        }
        Update: {
          created_at?: string
          cycle_id?: string
          final_status?: Database["public"]["Enums"]["task_status"] | null
          id?: string
          is_committed?: boolean
          is_locked?: boolean
          original_deadline?: string | null
          task_id?: string
          updated_at?: string
          user_id?: string
          weight?: number
          weight_confirmed_at?: string | null
          weight_confirmed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mvp_cycle_tasks_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "mvp_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mvp_cycle_tasks_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mvp_cycle_tasks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mvp_cycle_tasks_weight_confirmed_by_fkey"
            columns: ["weight_confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mvp_cycles: {
        Row: {
          created_at: string
          created_by: string | null
          data_locked_at: string | null
          id: string
          published_at: string | null
          published_by: string | null
          status: Database["public"]["Enums"]["mvp_cycle_status"]
          updated_at: string
          vote_closes_at: string | null
          vote_opens_at: string | null
          week_end: string
          week_start: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data_locked_at?: string | null
          id?: string
          published_at?: string | null
          published_by?: string | null
          status?: Database["public"]["Enums"]["mvp_cycle_status"]
          updated_at?: string
          vote_closes_at?: string | null
          vote_opens_at?: string | null
          week_end: string
          week_start: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data_locked_at?: string | null
          id?: string
          published_at?: string | null
          published_by?: string | null
          status?: Database["public"]["Enums"]["mvp_cycle_status"]
          updated_at?: string
          vote_closes_at?: string | null
          vote_opens_at?: string | null
          week_end?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "mvp_cycles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mvp_cycles_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mvp_data_adjustments: {
        Row: {
          after_data: Json | null
          before_data: Json | null
          created_at: string
          created_by: string
          cycle_id: string | null
          entity_id: string | null
          entity_type: string
          id: string
          reason: string
        }
        Insert: {
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          created_by: string
          cycle_id?: string | null
          entity_id?: string | null
          entity_type: string
          id?: string
          reason: string
        }
        Update: {
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          created_by?: string
          cycle_id?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "mvp_data_adjustments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mvp_data_adjustments_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "mvp_cycles"
            referencedColumns: ["id"]
          },
        ]
      }
      mvp_manual_reviews: {
        Row: {
          created_at: string
          cycle_id: string
          evidence: string | null
          id: string
          proactive_score: number
          quality_score: number
          reason: string | null
          reviewer_id: string
          status: Database["public"]["Enums"]["mvp_review_status"]
          subject_id: string
          submitted_at: string | null
          teamwork_score: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          cycle_id: string
          evidence?: string | null
          id?: string
          proactive_score?: number
          quality_score?: number
          reason?: string | null
          reviewer_id: string
          status?: Database["public"]["Enums"]["mvp_review_status"]
          subject_id: string
          submitted_at?: string | null
          teamwork_score?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          cycle_id?: string
          evidence?: string | null
          id?: string
          proactive_score?: number
          quality_score?: number
          reason?: string | null
          reviewer_id?: string
          status?: Database["public"]["Enums"]["mvp_review_status"]
          subject_id?: string
          submitted_at?: string | null
          teamwork_score?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mvp_manual_reviews_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "mvp_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mvp_manual_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mvp_manual_reviews_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mvp_score_components: {
        Row: {
          created_at: string
          criterion: string
          cycle_id: string
          earned_points: number
          formula: string | null
          id: string
          is_applicable: boolean
          max_points: number
          not_applicable_reason: string | null
          source_data: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          criterion: string
          cycle_id: string
          earned_points?: number
          formula?: string | null
          id?: string
          is_applicable?: boolean
          max_points: number
          not_applicable_reason?: string | null
          source_data?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          criterion?: string
          cycle_id?: string
          earned_points?: number
          formula?: string | null
          id?: string
          is_applicable?: boolean
          max_points?: number
          not_applicable_reason?: string | null
          source_data?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mvp_score_components_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "mvp_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mvp_score_components_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mvp_scorecards: {
        Row: {
          auto_score: number
          computed_at: string | null
          created_at: string
          cycle_id: string
          data_completeness: number
          id: string
          ineligible_reason: string | null
          is_eligible: boolean
          penalty_score: number
          review_score: number
          status: Database["public"]["Enums"]["mvp_scorecard_status"]
          team_id: string | null
          total_score: number
          updated_at: string
          user_id: string
          vote_score: number
        }
        Insert: {
          auto_score?: number
          computed_at?: string | null
          created_at?: string
          cycle_id: string
          data_completeness?: number
          id?: string
          ineligible_reason?: string | null
          is_eligible?: boolean
          penalty_score?: number
          review_score?: number
          status?: Database["public"]["Enums"]["mvp_scorecard_status"]
          team_id?: string | null
          total_score?: number
          updated_at?: string
          user_id: string
          vote_score?: number
        }
        Update: {
          auto_score?: number
          computed_at?: string | null
          created_at?: string
          cycle_id?: string
          data_completeness?: number
          id?: string
          ineligible_reason?: string | null
          is_eligible?: boolean
          penalty_score?: number
          review_score?: number
          status?: Database["public"]["Enums"]["mvp_scorecard_status"]
          team_id?: string | null
          total_score?: number
          updated_at?: string
          user_id?: string
          vote_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "mvp_scorecards_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "mvp_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mvp_scorecards_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mvp_scorecards_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mvp_votes: {
        Row: {
          created_at: string
          cycle_id: string
          id: string
          invalid_reason: string | null
          is_valid: boolean
          reason: string
          votee_id: string
          voter_id: string
        }
        Insert: {
          created_at?: string
          cycle_id: string
          id?: string
          invalid_reason?: string | null
          is_valid?: boolean
          reason: string
          votee_id: string
          voter_id: string
        }
        Update: {
          created_at?: string
          cycle_id?: string
          id?: string
          invalid_reason?: string | null
          is_valid?: boolean
          reason?: string
          votee_id?: string
          voter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mvp_votes_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "mvp_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mvp_votes_votee_id_fkey"
            columns: ["votee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mvp_votes_voter_id_fkey"
            columns: ["voter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          event_key: string
          event_type: string
          id: string
          link: string | null
          read_at: string | null
          recipient_id: string
          title: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_key: string
          event_type: string
          id?: string
          link?: string | null
          read_at?: string | null
          recipient_id: string
          title: string
        }
        Update: {
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_key?: string
          event_type?: string
          id?: string
          link?: string | null
          read_at?: string | null
          recipient_id?: string
          title?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_path: string | null
          birthday: string | null
          created_at: string
          display_name: string
          email: string
          id: string
          job_title: string | null
          must_change_password: boolean
          phone_number: string | null
          primary_team_id: string | null
          status: Database["public"]["Enums"]["account_status"]
          telegram_enabled: boolean
          telegram_test_error: string | null
          telegram_test_status: string | null
          telegram_tested_at: string | null
          telegram_user_id: string | null
          updated_at: string
        }
        Insert: {
          avatar_path?: string | null
          birthday?: string | null
          created_at?: string
          display_name: string
          email: string
          id: string
          job_title?: string | null
          must_change_password?: boolean
          phone_number?: string | null
          primary_team_id?: string | null
          status?: Database["public"]["Enums"]["account_status"]
          telegram_enabled?: boolean
          telegram_test_error?: string | null
          telegram_test_status?: string | null
          telegram_tested_at?: string | null
          telegram_user_id?: string | null
          updated_at?: string
        }
        Update: {
          avatar_path?: string | null
          birthday?: string | null
          created_at?: string
          display_name?: string
          email?: string
          id?: string
          job_title?: string | null
          must_change_password?: boolean
          phone_number?: string | null
          primary_team_id?: string | null
          status?: Database["public"]["Enums"]["account_status"]
          telegram_enabled?: boolean
          telegram_test_error?: string | null
          telegram_test_status?: string | null
          telegram_tested_at?: string | null
          telegram_user_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_primary_team_id_fkey"
            columns: ["primary_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      project_approvals: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: Database["public"]["Enums"]["app_role"] | null
          created_at: string
          from_status: Database["public"]["Enums"]["project_status"] | null
          id: string
          project_id: string
          reason: string | null
          round: number
          stage: string
          to_status: Database["public"]["Enums"]["project_status"] | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: Database["public"]["Enums"]["app_role"] | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["project_status"] | null
          id?: string
          project_id: string
          reason?: string | null
          round?: number
          stage: string
          to_status?: Database["public"]["Enums"]["project_status"] | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: Database["public"]["Enums"]["app_role"] | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["project_status"] | null
          id?: string
          project_id?: string
          reason?: string | null
          round?: number
          stage?: string
          to_status?: Database["public"]["Enums"]["project_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "project_approvals_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_approvals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_facilities: {
        Row: {
          created_at: string
          facility_id: string
          id: string
          project_id: string
        }
        Insert: {
          created_at?: string
          facility_id: string
          id?: string
          project_id: string
        }
        Update: {
          created_at?: string
          facility_id?: string
          id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_facilities_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_facilities_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_members: {
        Row: {
          created_at: string
          id: string
          project_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      project_teams: {
        Row: {
          created_at: string
          id: string
          project_id: string
          team_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          team_id: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_teams_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_teams_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          approval_round: number
          approved_at: string | null
          approved_by: string | null
          completed_at: string | null
          created_at: string
          created_by: string
          creator_role_snapshot: Database["public"]["Enums"]["app_role"] | null
          deadline: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          id: string
          last_decision_note: string | null
          manually_archived_at: string | null
          manually_archived_by: string | null
          name: string
          objective: string
          owner_id: string | null
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          responsible_team_id: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["project_status"]
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          approval_round?: number
          approved_at?: string | null
          approved_by?: string | null
          completed_at?: string | null
          created_at?: string
          created_by: string
          creator_role_snapshot?: Database["public"]["Enums"]["app_role"] | null
          deadline?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          last_decision_note?: string | null
          manually_archived_at?: string | null
          manually_archived_by?: string | null
          name: string
          objective: string
          owner_id?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          responsible_team_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          approval_round?: number
          approved_at?: string | null
          approved_by?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          creator_role_snapshot?: Database["public"]["Enums"]["app_role"] | null
          deadline?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          last_decision_note?: string | null
          manually_archived_at?: string | null
          manually_archived_by?: string | null
          name?: string
          objective?: string
          owner_id?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          responsible_team_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_manually_archived_by_fkey"
            columns: ["manually_archived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_rejected_by_fkey"
            columns: ["rejected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_responsible_team_id_fkey"
            columns: ["responsible_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      recognition_reports: {
        Row: {
          created_at: string
          handled_at: string | null
          handled_by: string | null
          id: string
          reason: string
          recognition_id: string
          reporter_id: string
          status: Database["public"]["Enums"]["recognition_report_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          reason: string
          recognition_id: string
          reporter_id: string
          status?: Database["public"]["Enums"]["recognition_report_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          reason?: string
          recognition_id?: string
          reporter_id?: string
          status?: Database["public"]["Enums"]["recognition_report_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recognition_reports_handled_by_fkey"
            columns: ["handled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recognition_reports_recognition_id_fkey"
            columns: ["recognition_id"]
            isOneToOne: false
            referencedRelation: "recognitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recognition_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recognitions: {
        Row: {
          category: Database["public"]["Enums"]["recognition_category"]
          created_at: string
          id: string
          message: string
          receiver_id: string
          receiver_team_id: string | null
          relation_type: string
          revoked_at: string | null
          sender_id: string
          sender_team_id: string | null
          updated_at: string
        }
        Insert: {
          category: Database["public"]["Enums"]["recognition_category"]
          created_at?: string
          id?: string
          message: string
          receiver_id: string
          receiver_team_id?: string | null
          relation_type?: string
          revoked_at?: string | null
          sender_id: string
          sender_team_id?: string | null
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["recognition_category"]
          created_at?: string
          id?: string
          message?: string
          receiver_id?: string
          receiver_team_id?: string | null
          relation_type?: string
          revoked_at?: string | null
          sender_id?: string
          sender_team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recognitions_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recognitions_receiver_team_id_fkey"
            columns: ["receiver_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recognitions_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recognitions_sender_team_id_fkey"
            columns: ["sender_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      report_exemption_requests: {
        Row: {
          after_data: Json | null
          before_data: Json | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          id: string
          obligation_id: string
          reason: string
          requested_by: string
          status: Database["public"]["Enums"]["report_exemption_status"]
          updated_at: string
        }
        Insert: {
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          obligation_id: string
          reason: string
          requested_by: string
          status?: Database["public"]["Enums"]["report_exemption_status"]
          updated_at?: string
        }
        Update: {
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          obligation_id?: string
          reason?: string
          requested_by?: string
          status?: Database["public"]["Enums"]["report_exemption_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_exemption_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_exemption_requests_obligation_id_fkey"
            columns: ["obligation_id"]
            isOneToOne: false
            referencedRelation: "report_obligations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_exemption_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      report_links: {
        Row: {
          created_at: string
          evidence_text: string | null
          id: string
          link_type: Database["public"]["Enums"]["report_link_kind"]
          project_id: string | null
          report_id: string
          section_id: string | null
          snapshot: Json
          snapshot_version: number
          summary: string | null
          task_id: string | null
          updated_at: string
          url: string | null
        }
        Insert: {
          created_at?: string
          evidence_text?: string | null
          id?: string
          link_type: Database["public"]["Enums"]["report_link_kind"]
          project_id?: string | null
          report_id: string
          section_id?: string | null
          snapshot?: Json
          snapshot_version?: number
          summary?: string | null
          task_id?: string | null
          updated_at?: string
          url?: string | null
        }
        Update: {
          created_at?: string
          evidence_text?: string | null
          id?: string
          link_type?: Database["public"]["Enums"]["report_link_kind"]
          project_id?: string | null
          report_id?: string
          section_id?: string | null
          snapshot?: Json
          snapshot_version?: number
          summary?: string | null
          task_id?: string | null
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_links_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_links_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_links_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "report_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_links_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      report_non_working_days: {
        Row: {
          created_at: string
          created_by: string | null
          day: string
          id: string
          reason: string
          team_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          day: string
          id?: string
          reason: string
          team_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          day?: string
          id?: string
          reason?: string
          team_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_non_working_days_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_non_working_days_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_non_working_days_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      report_obligations: {
        Row: {
          created_at: string
          due_at: string
          exempt_reason: string | null
          first_submitted_at: string | null
          id: string
          is_exempt: boolean
          is_late: boolean
          late_minutes: number | null
          period_id: string
          period_key: string
          report_id: string | null
          report_type: Database["public"]["Enums"]["report_kind"]
          reviewer_id: string | null
          team_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          due_at: string
          exempt_reason?: string | null
          first_submitted_at?: string | null
          id?: string
          is_exempt?: boolean
          is_late?: boolean
          late_minutes?: number | null
          period_id: string
          period_key: string
          report_id?: string | null
          report_type: Database["public"]["Enums"]["report_kind"]
          reviewer_id?: string | null
          team_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          due_at?: string
          exempt_reason?: string | null
          first_submitted_at?: string | null
          id?: string
          is_exempt?: boolean
          is_late?: boolean
          late_minutes?: number | null
          period_id?: string
          period_key?: string
          report_id?: string | null
          report_type?: Database["public"]["Enums"]["report_kind"]
          reviewer_id?: string | null
          team_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_obligations_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "report_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_obligations_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_obligations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_obligations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      report_periods: {
        Row: {
          config_snapshot: Json
          created_at: string
          due_at: string
          id: string
          opens_at: string
          period_end: string
          period_key: string
          period_start: string
          project_id: string | null
          report_type: Database["public"]["Enums"]["report_kind"]
          requirement_id: string | null
          status: Database["public"]["Enums"]["report_period_status"]
          team_id: string | null
          updated_at: string
        }
        Insert: {
          config_snapshot?: Json
          created_at?: string
          due_at: string
          id?: string
          opens_at: string
          period_end: string
          period_key: string
          period_start: string
          project_id?: string | null
          report_type: Database["public"]["Enums"]["report_kind"]
          requirement_id?: string | null
          status?: Database["public"]["Enums"]["report_period_status"]
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          config_snapshot?: Json
          created_at?: string
          due_at?: string
          id?: string
          opens_at?: string
          period_end?: string
          period_key?: string
          period_start?: string
          project_id?: string | null
          report_type?: Database["public"]["Enums"]["report_kind"]
          requirement_id?: string | null
          status?: Database["public"]["Enums"]["report_period_status"]
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_periods_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_periods_requirement_id_fkey"
            columns: ["requirement_id"]
            isOneToOne: false
            referencedRelation: "report_requirements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_periods_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      report_reopen_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          id: string
          planned_changes: string
          reason: string
          report_id: string
          requested_by: string
          status: Database["public"]["Enums"]["report_exemption_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          planned_changes: string
          reason: string
          report_id: string
          requested_by: string
          status?: Database["public"]["Enums"]["report_exemption_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          planned_changes?: string
          reason?: string
          report_id?: string
          requested_by?: string
          status?: Database["public"]["Enums"]["report_exemption_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_reopen_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_reopen_requests_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_reopen_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      report_requirements: {
        Row: {
          applies_all_teams: boolean
          cadence: string
          created_at: string
          created_by: string | null
          default_reviewer_id: string | null
          due_day_of_week: number | null
          due_time: string
          effective_from: string
          effective_to: string | null
          id: string
          is_active: boolean
          open_day_of_week: number | null
          open_time: string
          project_id: string | null
          report_type: Database["public"]["Enums"]["report_kind"]
          requires_ack: boolean
          requires_evidence: boolean
          team_id: string | null
          updated_at: string
        }
        Insert: {
          applies_all_teams?: boolean
          cadence?: string
          created_at?: string
          created_by?: string | null
          default_reviewer_id?: string | null
          due_day_of_week?: number | null
          due_time?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_active?: boolean
          open_day_of_week?: number | null
          open_time?: string
          project_id?: string | null
          report_type: Database["public"]["Enums"]["report_kind"]
          requires_ack?: boolean
          requires_evidence?: boolean
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          applies_all_teams?: boolean
          cadence?: string
          created_at?: string
          created_by?: string | null
          default_reviewer_id?: string | null
          due_day_of_week?: number | null
          due_time?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_active?: boolean
          open_day_of_week?: number | null
          open_time?: string
          project_id?: string | null
          report_type?: Database["public"]["Enums"]["report_kind"]
          requires_ack?: boolean
          requires_evidence?: boolean
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_requirements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_requirements_default_reviewer_id_fkey"
            columns: ["default_reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_requirements_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_requirements_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      report_reviewer_assignments: {
        Row: {
          created_at: string
          created_by: string | null
          delegate_id: string
          ends_at: string | null
          id: string
          is_active: boolean
          principal_id: string
          report_type: Database["public"]["Enums"]["report_kind"] | null
          starts_at: string
          team_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          delegate_id: string
          ends_at?: string | null
          id?: string
          is_active?: boolean
          principal_id: string
          report_type?: Database["public"]["Enums"]["report_kind"] | null
          starts_at?: string
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          delegate_id?: string
          ends_at?: string | null
          id?: string
          is_active?: boolean
          principal_id?: string
          report_type?: Database["public"]["Enums"]["report_kind"] | null
          starts_at?: string
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_reviewer_assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_reviewer_assignments_delegate_id_fkey"
            columns: ["delegate_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_reviewer_assignments_principal_id_fkey"
            columns: ["principal_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_reviewer_assignments_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      report_reviews: {
        Row: {
          action: Database["public"]["Enums"]["report_review_action"]
          actor_id: string
          body: string | null
          created_at: string
          id: string
          report_id: string | null
          round: number
          summary_id: string | null
          version: number | null
        }
        Insert: {
          action: Database["public"]["Enums"]["report_review_action"]
          actor_id: string
          body?: string | null
          created_at?: string
          id?: string
          report_id?: string | null
          round?: number
          summary_id?: string | null
          version?: number | null
        }
        Update: {
          action?: Database["public"]["Enums"]["report_review_action"]
          actor_id?: string
          body?: string | null
          created_at?: string
          id?: string
          report_id?: string | null
          round?: number
          summary_id?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "report_reviews_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_reviews_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      report_sections: {
        Row: {
          blockers: string | null
          created_at: string
          done_work: string | null
          id: string
          next_plan: string | null
          no_backlog_flag: boolean
          no_work_flag: boolean
          no_work_reason: string | null
          position: number
          report_id: string
          results: string | null
          support_needed: string | null
          team_id: string | null
          unfinished: string | null
          updated_at: string
        }
        Insert: {
          blockers?: string | null
          created_at?: string
          done_work?: string | null
          id?: string
          next_plan?: string | null
          no_backlog_flag?: boolean
          no_work_flag?: boolean
          no_work_reason?: string | null
          position?: number
          report_id: string
          results?: string | null
          support_needed?: string | null
          team_id?: string | null
          unfinished?: string | null
          updated_at?: string
        }
        Update: {
          blockers?: string | null
          created_at?: string
          done_work?: string | null
          id?: string
          next_plan?: string | null
          no_backlog_flag?: boolean
          no_work_flag?: boolean
          no_work_reason?: string | null
          position?: number
          report_id?: string
          results?: string | null
          support_needed?: string | null
          team_id?: string | null
          unfinished?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_sections_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_sections_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      report_versions: {
        Row: {
          content_snapshot: Json
          created_at: string
          created_by: string | null
          id: string
          report_id: string
          source_snapshot: Json
          submission_kind: Database["public"]["Enums"]["report_submission_kind"]
          version: number
        }
        Insert: {
          content_snapshot?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          report_id: string
          source_snapshot?: Json
          submission_kind: Database["public"]["Enums"]["report_submission_kind"]
          version: number
        }
        Update: {
          content_snapshot?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          report_id?: string
          source_snapshot?: Json
          submission_kind?: Database["public"]["Enums"]["report_submission_kind"]
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "report_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_versions_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          archive_reason: string | null
          archived_at: string | null
          archived_by: string | null
          author_id: string
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          current_version: number
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          due_at: string | null
          first_submitted_at: string | null
          id: string
          last_submitted_at: string | null
          legacy_daily_id: string | null
          legacy_weekly_id: string | null
          obligation_id: string | null
          period_id: string | null
          period_key: string
          project_id: string | null
          report_type: Database["public"]["Enums"]["report_kind"]
          requires_ack: boolean
          restore_reason: string | null
          restored_at: string | null
          restored_by: string | null
          reviewer_id: string | null
          revision_round: number
          status: Database["public"]["Enums"]["report_doc_status"]
          status_before_delete:
            | Database["public"]["Enums"]["report_doc_status"]
            | null
          team_id: string | null
          updated_at: string
        }
        Insert: {
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          author_id: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          current_version?: number
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          due_at?: string | null
          first_submitted_at?: string | null
          id?: string
          last_submitted_at?: string | null
          legacy_daily_id?: string | null
          legacy_weekly_id?: string | null
          obligation_id?: string | null
          period_id?: string | null
          period_key: string
          project_id?: string | null
          report_type: Database["public"]["Enums"]["report_kind"]
          requires_ack?: boolean
          restore_reason?: string | null
          restored_at?: string | null
          restored_by?: string | null
          reviewer_id?: string | null
          revision_round?: number
          status?: Database["public"]["Enums"]["report_doc_status"]
          status_before_delete?:
            | Database["public"]["Enums"]["report_doc_status"]
            | null
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          author_id?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          current_version?: number
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          due_at?: string | null
          first_submitted_at?: string | null
          id?: string
          last_submitted_at?: string | null
          legacy_daily_id?: string | null
          legacy_weekly_id?: string | null
          obligation_id?: string | null
          period_id?: string | null
          period_key?: string
          project_id?: string | null
          report_type?: Database["public"]["Enums"]["report_kind"]
          requires_ack?: boolean
          restore_reason?: string | null
          restored_at?: string | null
          restored_by?: string | null
          reviewer_id?: string | null
          revision_round?: number
          status?: Database["public"]["Enums"]["report_doc_status"]
          status_before_delete?:
            | Database["public"]["Enums"]["report_doc_status"]
            | null
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_obligation_id_fkey"
            columns: ["obligation_id"]
            isOneToOne: true
            referencedRelation: "report_obligations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "report_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_restored_by_fkey"
            columns: ["restored_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      task_participants: {
        Row: {
          created_at: string
          id: string
          task_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          task_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_participants_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      task_results: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          result_text: string
          task_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          result_text: string
          task_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          result_text?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_results_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_results_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_saved_views: {
        Row: {
          created_at: string
          filters: Json
          id: string
          is_default: boolean
          name: string
          sort_config: Json
          updated_at: string
          user_id: string
          visible_columns: Json
        }
        Insert: {
          created_at?: string
          filters?: Json
          id?: string
          is_default?: boolean
          name: string
          sort_config?: Json
          updated_at?: string
          user_id: string
          visible_columns?: Json
        }
        Update: {
          created_at?: string
          filters?: Json
          id?: string
          is_default?: boolean
          name?: string
          sort_config?: Json
          updated_at?: string
          user_id?: string
          visible_columns?: Json
        }
        Relationships: [
          {
            foreignKeyName: "task_saved_views_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assignee_id: string
          completed_at: string | null
          created_at: string
          created_by: string
          deadline: string
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          id: string
          is_archived: boolean
          manually_archived_at: string | null
          manually_archived_by: string | null
          name: string
          priority: Database["public"]["Enums"]["task_priority"]
          project_id: string | null
          result_text: string | null
          result_updated_at: string | null
          result_updated_by: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["task_status"]
          team_id: string | null
          updated_at: string
        }
        Insert: {
          assignee_id: string
          completed_at?: string | null
          created_at?: string
          created_by: string
          deadline: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          is_archived?: boolean
          manually_archived_at?: string | null
          manually_archived_by?: string | null
          name: string
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id?: string | null
          result_text?: string | null
          result_updated_at?: string | null
          result_updated_by?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          assignee_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string
          deadline?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          is_archived?: boolean
          manually_archived_at?: string | null
          manually_archived_by?: string | null
          name?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id?: string | null
          result_text?: string | null
          result_updated_at?: string | null
          result_updated_by?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_manually_archived_by_fkey"
            columns: ["manually_archived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_result_updated_by_fkey"
            columns: ["result_updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_collaborators: {
        Row: {
          created_at: string
          id: string
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_collaborators_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_collaborators_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      team_summary_versions: {
        Row: {
          content_snapshot: Json
          created_at: string
          created_by: string | null
          id: string
          summary_id: string
          system_snapshot: Json
          version: number
        }
        Insert: {
          content_snapshot?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          summary_id: string
          system_snapshot?: Json
          version: number
        }
        Update: {
          content_snapshot?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          summary_id?: string
          system_snapshot?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "team_summary_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_summary_versions_summary_id_fkey"
            columns: ["summary_id"]
            isOneToOne: false
            referencedRelation: "team_weekly_summaries"
            referencedColumns: ["id"]
          },
        ]
      }
      team_weekly_summaries: {
        Row: {
          blockers: string | null
          created_at: string
          current_version: number
          highlights: string | null
          id: string
          leader_id: string
          next_priorities: string | null
          published_at: string | null
          status: Database["public"]["Enums"]["report_doc_status"]
          submission_note: string | null
          support_needed: string | null
          system_snapshot: Json
          team_id: string
          unfinished: string | null
          updated_at: string
          week_start: string
        }
        Insert: {
          blockers?: string | null
          created_at?: string
          current_version?: number
          highlights?: string | null
          id?: string
          leader_id: string
          next_priorities?: string | null
          published_at?: string | null
          status?: Database["public"]["Enums"]["report_doc_status"]
          submission_note?: string | null
          support_needed?: string | null
          system_snapshot?: Json
          team_id: string
          unfinished?: string | null
          updated_at?: string
          week_start: string
        }
        Update: {
          blockers?: string | null
          created_at?: string
          current_version?: number
          highlights?: string | null
          id?: string
          leader_id?: string
          next_priorities?: string | null
          published_at?: string | null
          status?: Database["public"]["Enums"]["report_doc_status"]
          submission_note?: string | null
          support_needed?: string | null
          system_snapshot?: Json
          team_id?: string
          unfinished?: string | null
          updated_at?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_weekly_summaries_leader_id_fkey"
            columns: ["leader_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_weekly_summaries_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          id: string
          leader_id: string | null
          name: string
          telegram_enabled: boolean
          telegram_topic_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          leader_id?: string | null
          name: string
          telegram_enabled?: boolean
          telegram_topic_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          leader_id?: string | null
          name?: string
          telegram_enabled?: boolean
          telegram_topic_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_leader_fk"
            columns: ["leader_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_config: {
        Row: {
          bot_token: string | null
          created_at: string
          daily_report_topic_id: string | null
          group_chat_id: string
          id: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          bot_token?: string | null
          created_at?: string
          daily_report_topic_id?: string | null
          group_chat_id?: string
          id?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          bot_token?: string | null
          created_at?: string
          daily_report_topic_id?: string | null
          group_chat_id?: string
          id?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "telegram_config_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_outbox: {
        Row: {
          attempts: number
          chat_id: string
          created_at: string
          dedupe_key: string
          id: string
          last_error: string | null
          message: string
          message_type: string
          notification_id: string | null
          report_id: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["delivery_status"]
          target_id: string | null
          target_type: string
          telegram_message_id: string | null
          topic_id: string | null
          updated_at: string
        }
        Insert: {
          attempts?: number
          chat_id: string
          created_at?: string
          dedupe_key: string
          id?: string
          last_error?: string | null
          message: string
          message_type?: string
          notification_id?: string | null
          report_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["delivery_status"]
          target_id?: string | null
          target_type: string
          telegram_message_id?: string | null
          topic_id?: string | null
          updated_at?: string
        }
        Update: {
          attempts?: number
          chat_id?: string
          created_at?: string
          dedupe_key?: string
          id?: string
          last_error?: string | null
          message?: string
          message_type?: string
          notification_id?: string | null
          report_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["delivery_status"]
          target_id?: string | null
          target_type?: string
          telegram_message_id?: string | null
          topic_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_outbox_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_outbox_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "daily_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_team_links: {
        Row: {
          chat_id: string
          created_at: string
          id: string
          is_active: boolean
          team_id: string
          topic_id: string | null
          updated_at: string
        }
        Insert: {
          chat_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          team_id: string
          topic_id?: string | null
          updated_at?: string
        }
        Update: {
          chat_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          team_id?: string
          topic_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_team_links_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: true
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_user_links: {
        Row: {
          chat_id: string
          created_at: string
          id: string
          is_active: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          chat_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          chat_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_user_links_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      weekly_reports: {
        Row: {
          blockers: string | null
          created_at: string
          highlights: string | null
          id: string
          leader_id: string
          next_week_plan: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewer_id: string | null
          status: Database["public"]["Enums"]["report_status"]
          submitted_at: string | null
          team_id: string
          unfinished: string | null
          updated_at: string
          week_start: string
        }
        Insert: {
          blockers?: string | null
          created_at?: string
          highlights?: string | null
          id?: string
          leader_id: string
          next_week_plan?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          submitted_at?: string | null
          team_id: string
          unfinished?: string | null
          updated_at?: string
          week_start: string
        }
        Update: {
          blockers?: string | null
          created_at?: string
          highlights?: string | null
          id?: string
          leader_id?: string
          next_week_plan?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          submitted_at?: string | null
          team_id?: string
          unfinished?: string | null
          updated_at?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_reports_leader_id_fkey"
            columns: ["leader_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_reports_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_reports_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      announcement_acknowledge: {
        Args: { _a: string; _answers: Json }
        Returns: undefined
      }
      announcement_author: { Args: { _announcement: string }; Returns: string }
      announcement_comments_open: { Args: { _a: string }; Returns: boolean }
      announcement_current_version: { Args: { _a: string }; Returns: number }
      announcement_duplicate: { Args: { _a: string }; Returns: string }
      announcement_enqueue_reminders: { Args: never; Returns: number }
      announcement_is_active: { Args: { _a: string }; Returns: boolean }
      announcement_minor_revision: {
        Args: { _a: string; _body: string; _reason: string; _title: string }
        Returns: undefined
      }
      announcement_new_version: {
        Args: {
          _a: string
          _body: string
          _change_summary: string
          _comments_enabled: boolean
          _due_at: string
          _questions: Json
          _reason: string
          _result_visibility: string
          _title: string
        }
        Returns: number
      }
      announcement_revoke: {
        Args: { _a: string; _reason: string }
        Returns: undefined
      }
      announcement_set_archived: {
        Args: { _a: string; _archived: boolean }
        Returns: undefined
      }
      can_announce_to_team: { Args: { _team: string }; Returns: boolean }
      can_announce_to_user: { Args: { _target: string }; Returns: boolean }
      can_approve_deadline_change: {
        Args: { _entity_id: string; _entity_type: string }
        Returns: boolean
      }
      can_assign_task: {
        Args: { _person: string; _project: string; _team: string }
        Returns: boolean
      }
      can_create_document: {
        Args: {
          _project: string
          _scope: Database["public"]["Enums"]["document_scope"]
          _team: string
        }
        Returns: boolean
      }
      can_create_task: { Args: { _project: string }; Returns: boolean }
      can_edit_announcement: { Args: { _a: string }; Returns: boolean }
      can_edit_project_row: { Args: { _project: string }; Returns: boolean }
      can_edit_task_row: { Args: { _task: string }; Returns: boolean }
      can_manage_document: { Args: { _document: string }; Returns: boolean }
      can_manage_mvp_cycle: { Args: never; Returns: boolean }
      can_manage_profile: { Args: { _target: string }; Returns: boolean }
      can_manage_project: { Args: { _project: string }; Returns: boolean }
      can_manage_task: { Args: { _task: string }; Returns: boolean }
      can_moderate_announcement: { Args: never; Returns: boolean }
      can_recognize: { Args: { _target: string }; Returns: boolean }
      can_request_deadline_change: {
        Args: { _entity_id: string; _entity_type: string }
        Returns: boolean
      }
      can_resolve_document_link: {
        Args: { _document: string }
        Returns: boolean
      }
      can_review_daily_report: { Args: { _author: string }; Returns: boolean }
      can_review_mvp: { Args: { _subject: string }; Returns: boolean }
      can_review_weekly_report: { Args: never; Returns: boolean }
      can_view_announcement: { Args: { _a: string }; Returns: boolean }
      can_view_daily_report: {
        Args: { _author: string; _team: string }
        Returns: boolean
      }
      can_view_document: { Args: { _document: string }; Returns: boolean }
      can_view_mvp_scorecard: {
        Args: { _cycle: string; _subject: string }
        Returns: boolean
      }
      can_view_project: { Args: { _project: string }; Returns: boolean }
      can_view_task: { Args: { _task: string }; Returns: boolean }
      can_view_weekly_report: { Args: { _team: string }; Returns: boolean }
      current_app_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      deadline_change_decide: {
        Args: { _approve: boolean; _note?: string; _request: string }
        Returns: undefined
      }
      deadline_change_request: {
        Args: {
          _entity_id: string
          _entity_type: string
          _proposed: string
          _reason: string
        }
        Returns: string
      }
      doc_normalize_name: { Args: { _name: string }; Returns: string }
      doc_type_label: {
        Args: { _t: Database["public"]["Enums"]["document_type"] }
        Returns: string
      }
      document_approve: {
        Args: { _document: string; _self_reason?: string }
        Returns: Database["public"]["Enums"]["document_version_status"]
      }
      document_archive: {
        Args: { _document: string; _reason: string }
        Returns: undefined
      }
      document_is_published: { Args: { _document: string }; Returns: boolean }
      document_link_identity: { Args: { _url: string }; Returns: string }
      document_pick_admin: { Args: { _exclude: string[] }; Returns: string }
      document_reject: {
        Args: { _document: string; _reason: string }
        Returns: undefined
      }
      document_report_link: {
        Args: { _document: string; _note?: string }
        Returns: undefined
      }
      document_resolve_approver: {
        Args: { _document: string; _exclude?: string[] }
        Returns: string
      }
      document_resolve_link: {
        Args: { _document: string; _new_url?: string; _note?: string }
        Returns: undefined
      }
      document_restore: {
        Args: { _document: string; _reason: string }
        Returns: Database["public"]["Enums"]["document_version_status"]
      }
      document_set_approver: {
        Args: { _approver: string; _document: string }
        Returns: undefined
      }
      document_submit: { Args: { _document: string }; Returns: string }
      document_withdraw: { Args: { _document: string }; Returns: undefined }
      enqueue_telegram_user: {
        Args: {
          _dedupe: string
          _message: string
          _notification: string
          _user: string
        }
        Returns: undefined
      }
      has_overdue_announcement: { Args: { _user: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_active_account: { Args: { _user?: string }; Returns: boolean }
      is_announcement_recipient: {
        Args: { _announcement: string; _user: string }
        Returns: boolean
      }
      is_in_project_scope: {
        Args: { _person: string; _project: string }
        Returns: boolean
      }
      is_mvp_admin: { Args: never; Returns: boolean }
      is_mvp_cycle_published: { Args: { _cycle: string }; Returns: boolean }
      is_project_approved: { Args: { _project: string }; Returns: boolean }
      is_project_person: { Args: { _person: string }; Returns: boolean }
      is_project_team: { Args: { _team: string }; Returns: boolean }
      is_system_admin: { Args: { _user_id?: string }; Returns: boolean }
      leader_team_id: { Args: { _user_id: string }; Returns: string }
      mvp_cycle_status_of: {
        Args: { _cycle: string }
        Returns: Database["public"]["Enums"]["mvp_cycle_status"]
      }
      my_primary_team_id: { Args: never; Returns: string }
      my_team_ids: { Args: never; Returns: string[] }
      notify_team_telegram: {
        Args: { _dedupe: string; _message: string; _team: string }
        Returns: undefined
      }
      notify_user: {
        Args: {
          _body: string
          _entity_id: string
          _entity_type: string
          _event_key: string
          _event_type: string
          _link: string
          _recipient: string
          _title: string
        }
        Returns: undefined
      }
      project_decide: {
        Args: { _approve: boolean; _project: string; _reason?: string }
        Returns: Database["public"]["Enums"]["project_status"]
      }
      project_submit: {
        Args: { _project: string }
        Returns: Database["public"]["Enums"]["project_status"]
      }
      recognition_quota_left: { Args: never; Returns: number }
      recognition_stats: {
        Args: {
          _category?: Database["public"]["Enums"]["recognition_category"]
          _from: string
          _team?: string
          _to: string
          _user?: string
        }
        Returns: {
          display_name: string
          initiative_count: number
          quality_count: number
          receiver_id: string
          speed_count: number
          support_count: number
          team_id: string
          team_name: string
          teamwork_count: number
          total_count: number
        }[]
      }
      report_add_working_days: {
        Args: { _days: number; _from: string }
        Returns: string
      }
      report_can_archive: { Args: { _report: string }; Returns: boolean }
      report_cmo_id: { Args: never; Returns: string }
      report_config_manager: { Args: never; Returns: boolean }
      report_content_snapshot: { Args: { _report: string }; Returns: Json }
      report_current_reviewer: { Args: { _report: string }; Returns: string }
      report_decide_exemption: {
        Args: { _approve: boolean; _note?: string; _request: string }
        Returns: undefined
      }
      report_default_reviewer: {
        Args: { _team: string; _user: string }
        Returns: string
      }
      report_doc_editable: { Args: { _report: string }; Returns: boolean }
      report_doc_visible: { Args: { _report: string }; Returns: boolean }
      report_effective_reviewer: {
        Args: {
          _at?: string
          _default: string
          _report_type: Database["public"]["Enums"]["report_kind"]
          _team: string
        }
        Returns: string
      }
      report_ensure: { Args: { _obligation: string }; Returns: string }
      report_exempt_obligation: {
        Args: { _obligation: string; _reason: string }
        Returns: undefined
      }
      report_generate_daily: { Args: { _day?: string }; Returns: Json }
      report_generate_project: { Args: { _day?: string }; Returns: Json }
      report_generate_weekly: { Args: { _week_start?: string }; Returns: Json }
      report_is_non_working: {
        Args: { _day: string; _team: string; _user: string }
        Returns: boolean
      }
      report_link_snapshot: { Args: { _link: string }; Returns: Json }
      report_notify: {
        Args: {
          _body: string
          _entity_id: string
          _entity_type: string
          _event: string
          _event_key: string
          _link: string
          _recipient: string
          _skip_actor?: boolean
          _telegram?: boolean
          _title: string
        }
        Returns: undefined
      }
      report_refresh_reviewers: { Args: never; Returns: number }
      report_reopen_decide: {
        Args: { _approve: boolean; _note: string; _request: string }
        Returns: Database["public"]["Enums"]["report_doc_status"]
      }
      report_reopen_request: {
        Args: { _planned: string; _reason: string; _report: string }
        Returns: string
      }
      report_restore: {
        Args: { _reason: string; _report: string }
        Returns: undefined
      }
      report_review: {
        Args: {
          _action: Database["public"]["Enums"]["report_review_action"]
          _body: string
          _report: string
        }
        Returns: Database["public"]["Enums"]["report_doc_status"]
      }
      report_run_reminders: { Args: never; Returns: Json }
      report_section_visible: { Args: { _section: string }; Returns: boolean }
      report_set_archived: {
        Args: { _archived: boolean; _reason?: string; _report: string }
        Returns: undefined
      }
      report_soft_delete: {
        Args: { _reason: string; _report: string }
        Returns: undefined
      }
      report_submit: {
        Args: { _report: string }
        Returns: Database["public"]["Enums"]["report_doc_status"]
      }
      report_suggest_sources: { Args: { _report: string }; Returns: Json }
      report_team_leader: { Args: { _team: string }; Returns: boolean }
      report_transfer_author: {
        Args: { _new_author: string; _reason: string; _report: string }
        Returns: undefined
      }
      report_upsert_obligations: { Args: { _period: string }; Returns: number }
      set_manual_archive: {
        Args: { _archived: boolean; _entity_id: string; _entity_type: string }
        Returns: undefined
      }
      soft_delete_entity: {
        Args: { _entity_id: string; _entity_type: string }
        Returns: undefined
      }
      team_summary_ensure: {
        Args: { _team: string; _week_start: string }
        Returns: string
      }
      team_summary_feedback: {
        Args: { _body: string; _request_revision: boolean; _summary: string }
        Returns: undefined
      }
      team_summary_publish: { Args: { _summary: string }; Returns: undefined }
      team_summary_visible: { Args: { _summary: string }; Returns: boolean }
      write_audit: {
        Args: {
          _action: string
          _after: Json
          _before: Json
          _entity_id: string
          _entity_type: string
          _metadata?: Json
        }
        Returns: undefined
      }
    }
    Enums: {
      account_status: "active" | "locked" | "resigned"
      announcement_recipient_status:
        | "unread"
        | "reading"
        | "completed"
        | "exempt"
      announcement_status: "draft" | "published"
      announcement_target_type: "user" | "team"
      app_role: "admin" | "cmo" | "leader" | "member"
      delivery_status: "pending" | "sent" | "failed"
      document_scope: "system" | "team" | "project"
      document_source:
        | "google_docs"
        | "google_sheets"
        | "google_slides"
        | "google_drive"
        | "canva"
        | "notion"
        | "website"
        | "other"
      document_type:
        | "regulation"
        | "process"
        | "guide"
        | "form"
        | "plan"
        | "report"
        | "training"
        | "reference"
        | "other"
      document_version_status:
        | "draft"
        | "pending_approval"
        | "scheduled"
        | "active"
        | "expired"
        | "archived"
      mvp_award_status: "proposed" | "approved" | "not_awarded" | "published"
      mvp_award_type:
        | "mvp"
        | "effective"
        | "proactive"
        | "teamwork"
        | "progress"
        | "creative"
      mvp_cycle_status:
        | "collecting"
        | "voting"
        | "reviewing"
        | "pending_publish"
        | "published"
      mvp_review_status: "draft" | "submitted"
      mvp_scorecard_status:
        | "draft"
        | "computed"
        | "reviewed"
        | "final"
        | "disqualified"
      project_status:
        | "idea"
        | "leader_review"
        | "proposal"
        | "planning"
        | "in_progress"
        | "pending_acceptance"
        | "completed"
        | "archived"
        | "rejected"
      recognition_category:
        | "support"
        | "quality"
        | "speed"
        | "initiative"
        | "teamwork"
      recognition_report_status: "open" | "dismissed" | "actioned"
      report_doc_status:
        | "draft"
        | "submitted"
        | "pending_review"
        | "revision_required"
        | "confirmed"
        | "reopened"
        | "published"
      report_exemption_status: "pending" | "approved" | "rejected"
      report_kind: "daily" | "weekly" | "project" | "project_closure"
      report_link_kind: "task" | "project" | "url" | "text"
      report_period_status: "scheduled" | "open" | "closed"
      report_review_action:
        | "comment"
        | "request_revision"
        | "confirm"
        | "reopen_request"
        | "reopen_approve"
        | "reopen_reject"
        | "summary_feedback"
      report_status: "draft" | "submitted" | "changes_requested" | "approved"
      report_submission_kind: "initial" | "resubmit" | "reopen"
      task_priority: "low" | "medium" | "high"
      task_status: "not_started" | "in_progress" | "review" | "done"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      account_status: ["active", "locked", "resigned"],
      announcement_recipient_status: [
        "unread",
        "reading",
        "completed",
        "exempt",
      ],
      announcement_status: ["draft", "published"],
      announcement_target_type: ["user", "team"],
      app_role: ["admin", "cmo", "leader", "member"],
      delivery_status: ["pending", "sent", "failed"],
      document_scope: ["system", "team", "project"],
      document_source: [
        "google_docs",
        "google_sheets",
        "google_slides",
        "google_drive",
        "canva",
        "notion",
        "website",
        "other",
      ],
      document_type: [
        "regulation",
        "process",
        "guide",
        "form",
        "plan",
        "report",
        "training",
        "reference",
        "other",
      ],
      document_version_status: [
        "draft",
        "pending_approval",
        "scheduled",
        "active",
        "expired",
        "archived",
      ],
      mvp_award_status: ["proposed", "approved", "not_awarded", "published"],
      mvp_award_type: [
        "mvp",
        "effective",
        "proactive",
        "teamwork",
        "progress",
        "creative",
      ],
      mvp_cycle_status: [
        "collecting",
        "voting",
        "reviewing",
        "pending_publish",
        "published",
      ],
      mvp_review_status: ["draft", "submitted"],
      mvp_scorecard_status: [
        "draft",
        "computed",
        "reviewed",
        "final",
        "disqualified",
      ],
      project_status: [
        "idea",
        "leader_review",
        "proposal",
        "planning",
        "in_progress",
        "pending_acceptance",
        "completed",
        "archived",
        "rejected",
      ],
      recognition_category: [
        "support",
        "quality",
        "speed",
        "initiative",
        "teamwork",
      ],
      recognition_report_status: ["open", "dismissed", "actioned"],
      report_doc_status: [
        "draft",
        "submitted",
        "pending_review",
        "revision_required",
        "confirmed",
        "reopened",
        "published",
      ],
      report_exemption_status: ["pending", "approved", "rejected"],
      report_kind: ["daily", "weekly", "project", "project_closure"],
      report_link_kind: ["task", "project", "url", "text"],
      report_period_status: ["scheduled", "open", "closed"],
      report_review_action: [
        "comment",
        "request_revision",
        "confirm",
        "reopen_request",
        "reopen_approve",
        "reopen_reject",
        "summary_feedback",
      ],
      report_status: ["draft", "submitted", "changes_requested", "approved"],
      report_submission_kind: ["initial", "resubmit", "reopen"],
      task_priority: ["low", "medium", "high"],
      task_status: ["not_started", "in_progress", "review", "done"],
    },
  },
} as const
