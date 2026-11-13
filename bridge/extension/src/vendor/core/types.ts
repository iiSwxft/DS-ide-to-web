/** A parsed server-sent event as the DeepSeek stream decoder hands it around. */
export interface SSEEvent {
  id?: string;
  type: string;
  data: string;
}
