import { Alert, AlertDescription } from "@lens/ui/components/alert";
import { Button } from "@lens/ui/components/button";
import { Card, CardContent } from "@lens/ui/components/card";
import { Field, FieldLabel } from "@lens/ui/components/field";
import { Input } from "@lens/ui/components/input";
import { WarningCircle as AlertCircle, CaretRight as ChevronRight } from "@phosphor-icons/react";
import { AnviaLensLogo } from "../../../components/anvia-lens-logo";
import { ModeToggle } from "../../../components/mode-toggle";
import { useProjectSetup } from "../hooks/use-project-setup";

export function ProjectSetup() {
  const setup = useProjectSetup();
  return (
    <main className="relative flex min-h-svh items-center justify-center bg-background p-4">
      <div className="absolute top-4 left-4 sm:top-6 sm:left-6">
        <AnviaLensLogo />
      </div>
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6">
        <ModeToggle standalone />
      </div>
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="font-semibold text-xl tracking-tight">Workspace setup</h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Create your first project to get started.
          </p>
        </div>
        <Card className="w-full py-8">
          <CardContent className="px-8">
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
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
