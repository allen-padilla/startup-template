import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { buttonVariants } from "./button";
import { FormMessage } from "./form-message";
import { Input } from "./input";
import { Label } from "./label";

describe("Input", () => {
  it("forwards attributes to the input", () => {
    const html = renderToStaticMarkup(
      <Input id="email" name="email" type="email" required aria-invalid autoComplete="email" />,
    );

    expect(html).toMatch(/^<input /);
    expect(html).toContain('id="email"');
    expect(html).toContain('type="email"');
    expect(html).toContain('required=""');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('autoComplete="email"');
  });

  it("merges a class name over its own", () => {
    const html = renderToStaticMarkup(<Input className="h-12" />);

    expect(html).toContain("h-12");
    expect(html).not.toContain("h-10");
  });
});

describe("Label", () => {
  it("renders a label for a control", () => {
    expect(renderToStaticMarkup(<Label htmlFor="email">Email</Label>)).toBe(
      '<label class="text-sm font-medium" for="email">Email</label>',
    );
  });
});

describe("FormMessage", () => {
  it("announces errors at once", () => {
    expect(renderToStaticMarkup(<FormMessage tone="error">Invalid email or password.</FormMessage>)).toContain(
      'role="alert"',
    );
  });

  it.each(["success", "info", undefined] as const)("announces %s messages politely", (tone) => {
    expect(renderToStaticMarkup(<FormMessage tone={tone}>Done.</FormMessage>)).toContain('role="status"');
  });

  it("keeps links and other content", () => {
    const html = renderToStaticMarkup(
      <FormMessage tone="error">
        Exists. <a href="/sign-in">Sign in</a>
      </FormMessage>,
    );

    expect(html).toContain('<a href="/sign-in">Sign in</a>');
  });

  it.each([undefined, null, false, ""])("renders nothing for %j", (children) => {
    expect(renderToStaticMarkup(<FormMessage tone="error">{children}</FormMessage>)).toBe("");
  });
});

describe("buttonVariants", () => {
  it("styles other elements, such as links, as buttons", () => {
    const classes = buttonVariants({ size: "lg" });

    expect(classes).toContain("inline-flex");
    expect(classes).toContain("bg-black");
    expect(classes).toContain("h-11");
  });
});
