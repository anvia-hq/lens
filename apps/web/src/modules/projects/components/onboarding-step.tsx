import { Badge } from "@lens/ui/components/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@lens/ui/components/card";

export function OnboardingStep(props: { number: string; title: string; text: string }) {
  return (
    <Card>
      <CardHeader>
        <Badge variant="secondary">{props.number}</Badge>
        <CardTitle>{props.title}</CardTitle>
        <CardDescription>{props.text}</CardDescription>
      </CardHeader>
    </Card>
  );
}
