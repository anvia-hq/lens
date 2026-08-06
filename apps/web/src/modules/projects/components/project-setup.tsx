import { Alert, AlertDescription } from "@lens/ui/components/alert";
import { Button } from "@lens/ui/components/button";
import { Field, FieldLabel } from "@lens/ui/components/field";
import { Input } from "@lens/ui/components/input";
import {
  WarningCircle as AlertCircle,
  CaretRight as ChevronRight,
  DotOutline as CircleDot,
} from "@phosphor-icons/react";
import { CenteredCard } from "../../../components/centered-card";
import { useProjectSetup } from "../hooks/use-project-setup";

export function ProjectSetup() {
  const setup = useProjectSetup();
  return (
    <CenteredCard
      icon={<CircleDot />}
      eyebrow="First project"
      title="Create a project"
      description="Projects isolate ingestion keys and trace data."
    >
      <form className="grid gap-4" onSubmit={setup.submit}>
        <Field>
          <FieldLabel htmlFor="setup-name">Name</FieldLabel>
          <Input
            id="setup-name"
            required
            value={setup.name}
            onChange={(event) => setup.setProjectName(event.target.value)}
            placeholder="Production agents"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="setup-slug">Slug</FieldLabel>
          <Input
            id="setup-slug"
            required
            value={setup.slug}
            onChange={(event) => setup.setSlug(event.target.value)}
            placeholder="production-agents"
          />
        </Field>
        {setup.error ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{setup.error}</AlertDescription>
          </Alert>
        ) : null}
        <Button type="submit">
          Continue <ChevronRight />
        </Button>
      </form>
    </CenteredCard>
  );
}
