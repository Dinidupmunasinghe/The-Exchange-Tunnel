import { Link } from "react-router";
import { motion } from "motion/react";
import type { ComponentProps } from "react";
import { GET_STARTED_PATH } from "./constants";

const MotionLink = motion.create(Link);

type GetStartedLinkProps = Omit<ComponentProps<typeof MotionLink>, "to"> & {
  to?: string;
};

export function GetStartedLink({
  to = GET_STARTED_PATH,
  className,
  children,
  ...props
}: GetStartedLinkProps) {
  return (
    <MotionLink to={to} className={className} {...props}>
      {children}
    </MotionLink>
  );
}
