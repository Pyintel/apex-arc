import { expect, test, describe } from "bun:test"
import { extractCodeGraph } from "../../src/util/codegraph"

describe("Code Graph Extractor", () => {
    test("extracts classes, methods and functions", () => {
        const code = `
            export class AuthHandler {
                login() {
                    return this.doLogin();
                }
                doLogin() {
                   return true;
                }
            }
            export function checkAuth() {
                const handler = new AuthHandler();
                handler.login();
            }
        `
        const graph = extractCodeGraph("test.ts", code)

        expect(graph.symbols.length).toBe(4) // AuthHandler, login, doLogin, checkAuth
        expect(graph.symbols.find(s => s.name === "AuthHandler")?.type).toBe("class")
        expect(graph.symbols.find(s => s.name === "login")?.type).toBe("method")
        expect(graph.symbols.find(s => s.name === "checkAuth")?.type).toBe("function")

        // Check edges
        expect(graph.edges.find(e => e.from_symbol_name === "login" && e.to_symbol_name === "doLogin")).toBeDefined()
        // AuthHandler edge
        expect(graph.edges.find(e => e.from_symbol_name === "checkAuth" && e.to_symbol_name === "login")).toBeDefined()
    })

    test("extracts imports and variables", () => {
        const code = `
           import { x } from "y";
           export const myVar = x();
        `
        const graph = extractCodeGraph("test.ts", code)

        expect(graph.symbols.length).toBe(1)
        expect(graph.symbols[0].name).toBe("myVar")
        expect(graph.symbols[0].type).toBe("variable")

        expect(graph.edges.length).toBe(2)
        expect(graph.edges.find(e => e.type === "imports" && e.to_symbol_name === "x")).toBeDefined()
        expect(graph.edges.find(e => e.type === "calls" && e.from_symbol_name === "myVar" && e.to_symbol_name === "x")).toBeDefined()
    })
})
