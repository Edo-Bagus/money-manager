
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "accounts": {
                  Row: {
                    "archived_at": string | null,"check_policy": Database["public"]['Enums']["check_policy"],"created_at": string,"id": string,"identifiers": NonNullable<Json>,"is_own": boolean,"kind": Database["public"]['Enums']["account_kind"],"name": string,"owner_id": string,"subtype": Database["public"]['Enums']["asset_subtype"] | null,"system_key": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"check_policy"?: Database["public"]['Enums']["check_policy"],"created_at"?: string,"id"?: string,"identifiers"?: NonNullable<Json>,"is_own"?: boolean,"kind": Database["public"]['Enums']["account_kind"],"name": string,"owner_id"?: string,"subtype"?: Database["public"]['Enums']["asset_subtype"] | null,"system_key"?: string | null
                  }
                  Update: {
                    "archived_at"?: string | null,"check_policy"?: Database["public"]['Enums']["check_policy"],"created_at"?: string,"id"?: string,"identifiers"?: NonNullable<Json>,"is_own"?: boolean,"kind"?: Database["public"]['Enums']["account_kind"],"name"?: string,"owner_id"?: string,"subtype"?: Database["public"]['Enums']["asset_subtype"] | null,"system_key"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"balance_checks": {
                  Row: {
                    "account_id": string,"actual_sen": number,"check_date": string,"created_at": string,"diff_sen": number | null,"expected_sen": number,"id": string,"owner_id": string,"resolution": Database["public"]['Enums']["balance_resolution"]
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"actual_sen": number,"check_date": string,"created_at"?: string,"diff_sen"?: never,"expected_sen": number,"id"?: string,"owner_id"?: string,"resolution": Database["public"]['Enums']["balance_resolution"]
                  }
                  Update: {
                    "account_id"?: string,"actual_sen"?: number,"check_date"?: string,"created_at"?: string,"diff_sen"?: never,"expected_sen"?: number,"id"?: string,"owner_id"?: string,"resolution"?: Database["public"]['Enums']["balance_resolution"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "balance_checks_account_fkey"
      columns: ["owner_id","account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["owner_id","id"]
    }
                  ]
                },"day_closures": {
                  Row: {
                    "closed_at": string,"date": string,"id": string,"owner_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "closed_at"?: string,"date": string,"id"?: string,"owner_id"?: string
                  }
                  Update: {
                    "closed_at"?: string,"date"?: string,"id"?: string,"owner_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"postings": {
                  Row: {
                    "account_id": string,"amount_sen": number,"created_at": string,"id": string,"owner_id": string,"transaction_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"amount_sen": number,"created_at"?: string,"id"?: string,"owner_id"?: string,"transaction_id": string
                  }
                  Update: {
                    "account_id"?: string,"amount_sen"?: number,"created_at"?: string,"id"?: string,"owner_id"?: string,"transaction_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "postings_account_fkey"
      columns: ["owner_id","account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["owner_id","id"]
    },{
      foreignKeyName: "postings_transaction_fkey"
      columns: ["owner_id","transaction_id"]
isOneToOne: false
      referencedRelation: "transactions"
      referencedColumns: ["owner_id","id"]
    }
                  ]
                },"transactions": {
                  Row: {
                    "created_at": string,"description": string,"external_ref": string | null,"id": string,"notes": string | null,"occurred_at": string,"owner_id": string,"source": Database["public"]['Enums']["transaction_source"],"source_key": string | null,"status": Database["public"]['Enums']["transaction_status"],"tags": (string)[],"template": Database["public"]['Enums']["transaction_template"] | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"description"?: string,"external_ref"?: string | null,"id"?: string,"notes"?: string | null,"occurred_at": string,"owner_id"?: string,"source": Database["public"]['Enums']["transaction_source"],"source_key"?: string | null,"status": Database["public"]['Enums']["transaction_status"],"tags"?: (string)[],"template"?: Database["public"]['Enums']["transaction_template"] | null
                  }
                  Update: {
                    "created_at"?: string,"description"?: string,"external_ref"?: string | null,"id"?: string,"notes"?: string | null,"occurred_at"?: string,"owner_id"?: string,"source"?: Database["public"]['Enums']["transaction_source"],"source_key"?: string | null,"status"?: Database["public"]['Enums']["transaction_status"],"tags"?: (string)[],"template"?: Database["public"]['Enums']["transaction_template"] | null
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "create_transaction":
{ Args: { "p_description"?: string,"p_external_ref"?: string,"p_notes"?: string,"p_occurred_at": string,"p_postings": Json,"p_source": Database["public"]['Enums']["transaction_source"],"p_source_key"?: string,"p_status": Database["public"]['Enums']["transaction_status"],"p_tags"?: (string)[],"p_template"?: Database["public"]['Enums']["transaction_template"] }; Returns: string
                           },
"delete_transaction":
{ Args: { "p_id": string }; Returns: undefined
                           },
"ensure_default_accounts":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"update_transaction":
{ Args: { "p_description": string,"p_id": string,"p_notes": string,"p_occurred_at": string,"p_postings": Json,"p_status": Database["public"]['Enums']["transaction_status"],"p_tags": (string)[],"p_template": Database["public"]['Enums']["transaction_template"] }; Returns: undefined
                           }
          }
          Enums: {
            "account_kind": "asset"|"person"|"expense"|"income"|"equity","asset_subtype": "bank"|"ewallet"|"investment"|"cash","balance_resolution": "ok"|"added_txn"|"fee_interest"|"carried_over","check_policy": "daily_if_active"|"monthly"|"never","transaction_source": "email"|"manual"|"reconcile","transaction_status": "draft"|"confirmed","transaction_template": "pengeluaran"|"pemasukan"|"transfer"|"pinjamkan"|"dipinjami"|"dibayari"|"terima_pelunasan"|"bayar_utang"|"patungan"|"ikhlaskan_piutang"|"biaya_reimburse"|"refund"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "account_kind": ["asset", "person", "expense", "income", "equity"],"asset_subtype": ["bank", "ewallet", "investment", "cash"],"balance_resolution": ["ok", "added_txn", "fee_interest", "carried_over"],"check_policy": ["daily_if_active", "monthly", "never"],"transaction_source": ["email", "manual", "reconcile"],"transaction_status": ["draft", "confirmed"],"transaction_template": ["pengeluaran", "pemasukan", "transfer", "pinjamkan", "dipinjami", "dibayari", "terima_pelunasan", "bayar_utang", "patungan", "ikhlaskan_piutang", "biaya_reimburse", "refund"]
          }
        }
} as const
