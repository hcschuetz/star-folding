
export default
function scalarOp(op: string, args: number[]): number {
  switch (op) {
    case "+": return args.reduce((acc, arg) => acc + arg, 0);
    case "-": return args[0] - args[1];
    case "*": return args.reduce((acc, arg) => acc * arg, 1);
    case "/": return args[0] / args[1];
    case "inversesqrt": return 1 / Math.sqrt(args[0]);
    case "unaryMinus": return -args[0];
    // TODO support more WebGL2 functions here
    // TODO apply nArgs(...)?
    default: return (Math as any)[op](...args);
  }
}
