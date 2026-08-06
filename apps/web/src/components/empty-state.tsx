import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@lens/ui/components/empty";
import type { ReactNode } from "react";

export function EmptyState(props: {
  icon: ReactNode;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <Empty className="min-h-64">
      <EmptyHeader>
        <EmptyMedia variant="icon">{props.icon}</EmptyMedia>
        <EmptyTitle>{props.title}</EmptyTitle>
        <EmptyDescription>{props.text}</EmptyDescription>
      </EmptyHeader>
      {props.action ? <EmptyContent>{props.action}</EmptyContent> : null}
    </Empty>
  );
}
