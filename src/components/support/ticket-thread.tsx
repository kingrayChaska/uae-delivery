import { useFormat } from '@/i18n/hooks';

type TicketThreadProps = {
  messages: { id: string; message: string; senderIsMe: boolean; createdAt: string }[];
};

// A ticket's conversation. Your own messages sit on the end side (right in
// English, left in Arabic), like a chat.
const TicketThread = ({ messages }: TicketThreadProps) => {
  const format = useFormat();
  return (
    <div className="flex flex-col gap-3">
      {messages.map((message) => (
        <div
          key={message.id}
          className={`max-w-lg rounded-md border p-3 text-sm ${message.senderIsMe ? 'self-end bg-secondary/50' : 'self-start'}`}
        >
          <p className="whitespace-pre-line">{message.message}</p>
          <p className="mt-1 font-brand-mono text-xs text-muted-foreground">{format.dateTime(message.createdAt)}</p>
        </div>
      ))}
    </div>
  );
};

export default TicketThread;
