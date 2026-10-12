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
      cards: {
        Row: {
          apr: number
          balance: number
          id: string
          min_floor: number
          min_pct: number
          name: string
          position: number
          scenario_id: string
          user_id: string
        }
        Insert: {
          apr?: number
          balance?: number
          id?: string
          min_floor?: number
          min_pct?: number
          name?: string
          position?: number
          scenario_id: string
          user_id?: string
        }
        Update: {
          apr?: number
          balance?: number
          id?: string
          min_floor?: number
          min_pct?: number
          name?: string
          position?: number
          scenario_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cards_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "scenarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_scenario_user_owner_fkey"
            columns: ["scenario_id", "user_id"]
            isOneToOne: false
            referencedRelation: "scenarios"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      debt_achievements: {
        Row: {
          achievement_key: string
          earned_at: string
          id: string
          scenario_id: string
          user_id: string
        }
        Insert: {
          achievement_key: string
          earned_at?: string
          id?: string
          scenario_id: string
          user_id: string
        }
        Update: {
          achievement_key?: string
          earned_at?: string
          id?: string
          scenario_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "debt_achievements_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "scenarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debt_achievements_scenario_owner_fkey"
            columns: ["scenario_id", "user_id"]
            isOneToOne: false
            referencedRelation: "scenarios"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      debt_baselines: {
        Row: {
          baseline_amount: number
          created_at: string
          id: string
          scenario_id: string
          user_id: string
        }
        Insert: {
          baseline_amount: number
          created_at?: string
          id?: string
          scenario_id: string
          user_id: string
        }
        Update: {
          baseline_amount?: number
          created_at?: string
          id?: string
          scenario_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "debt_baselines_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "scenarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debt_baselines_scenario_owner_fkey"
            columns: ["scenario_id", "user_id"]
            isOneToOne: false
            referencedRelation: "scenarios"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      debt_payments: {
        Row: {
          amount: number
          card_id: string
          created_at: string
          id: string
          payment_date: string
          scenario_id: string
          user_id: string
        }
        Insert: {
          amount: number
          card_id: string
          created_at?: string
          id?: string
          payment_date?: string
          scenario_id: string
          user_id: string
        }
        Update: {
          amount?: number
          card_id?: string
          created_at?: string
          id?: string
          payment_date?: string
          scenario_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "debt_payments_card_scenario_owner_fkey"
            columns: ["card_id", "scenario_id", "user_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id", "scenario_id", "user_id"]
          },
          {
            foreignKeyName: "debt_payments_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "scenarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debt_payments_scenario_owner_fkey"
            columns: ["scenario_id", "user_id"]
            isOneToOne: false
            referencedRelation: "scenarios"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      monthly_progress: {
        Row: {
          id: string
          month: string
          payment_count: number
          scenario_id: string
          total_paid: number
          updated_at: string
          user_id: string
        }
        Insert: {
          id?: string
          month: string
          payment_count?: number
          scenario_id: string
          total_paid?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          id?: string
          month?: string
          payment_count?: number
          scenario_id?: string
          total_paid?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "monthly_progress_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "scenarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_progress_scenario_owner_fkey"
            columns: ["scenario_id", "user_id"]
            isOneToOne: false
            referencedRelation: "scenarios"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          email?: string
          id: string
          name?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      saved_cards: {
        Row: {
          apr: number
          balance: number
          created_at: string
          id: string
          last_updated: string
          min_floor: number
          min_pct: number
          name: string
          user_id: string
        }
        Insert: {
          apr?: number
          balance?: number
          created_at?: string
          id?: string
          last_updated?: string
          min_floor?: number
          min_pct?: number
          name: string
          user_id?: string
        }
        Update: {
          apr?: number
          balance?: number
          created_at?: string
          id?: string
          last_updated?: string
          min_floor?: number
          min_pct?: number
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      scenarios: {
        Row: {
          budget: number
          budget_mode: string
          created_at: string
          id: string
          name: string
          strategy: string
          updated_at: string
          user_id: string
        }
        Insert: {
          budget?: number
          budget_mode?: string
          created_at?: string
          id?: string
          name?: string
          strategy?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          budget?: number
          budget_mode?: string
          created_at?: string
          id?: string
          name?: string
          strategy?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      record_debt_payment: {
        Args: {
          p_amount: number
          p_card_id: string
          p_payment_date: string
          p_scenario_id: string
        }
        Returns: Database["public"]["Tables"]["debt_payments"]["Row"]
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
