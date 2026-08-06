import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@lens/ui/components/card";
import type { ReactNode } from "react";

export function OverviewChartCard(props: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{props.title}</CardTitle>
        <CardDescription>{props.description}</CardDescription>
      </CardHeader>
      <CardContent>{props.children}</CardContent>
    </Card>
  );
}
