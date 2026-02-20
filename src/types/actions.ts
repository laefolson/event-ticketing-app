// Standard Server Action response type
export interface ActionResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
