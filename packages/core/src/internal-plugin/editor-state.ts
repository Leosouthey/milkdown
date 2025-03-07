/* Copyright 2021, Milkdown by Mirone. */
import { createSlice, createTimer, MilkdownPlugin, Timer } from '@milkdown/ctx';
import { docTypeError } from '@milkdown/exception';
import { customInputRules as createInputRules } from '@milkdown/prose';
import { baseKeymap } from '@milkdown/prose/commands';
import { keymap as createKeymap } from '@milkdown/prose/keymap';
import { DOMParser, Node, Schema } from '@milkdown/prose/model';
import { EditorState, Plugin, PluginKey } from '@milkdown/prose/state';
import { JSONRecord } from '@milkdown/transformer';

import { CommandsReady } from '.';
import { inputRulesCtx, prosePluginsCtx } from './init';
import { Parser, parserCtx, ParserReady } from './parser';
import { schemaCtx } from './schema';
import { SerializerReady } from './serializer';

type DefaultValue = string | { type: 'html'; dom: HTMLElement } | { type: 'json'; value: JSONRecord };
type StateOptions = Parameters<typeof EditorState.create>[0];
type StateOptionsOverride = (prev: StateOptions) => StateOptions;

export const defaultValueCtx = createSlice('' as DefaultValue, 'defaultValue');
export const editorStateCtx = createSlice({} as EditorState, 'editorState');
export const editorStateOptionsCtx = createSlice<StateOptionsOverride>((x) => x, 'stateOptions');
export const editorStateTimerCtx = createSlice([] as Timer[], 'editorStateTimer');

export const EditorStateReady = createTimer('EditorStateReady');

const key = new PluginKey('MILKDOWN_PLUGIN_STATE_TRACKER');

const getDoc = (defaultValue: DefaultValue, parser: Parser, schema: Schema) => {
    if (typeof defaultValue === 'string') {
        return parser(defaultValue);
    }

    if (defaultValue.type === 'html') {
        return DOMParser.fromSchema(schema).parse(defaultValue.dom);
    }

    if (defaultValue.type === 'json') {
        return Node.fromJSON(schema, defaultValue.value);
    }

    throw docTypeError(defaultValue);
};

export const editorState: MilkdownPlugin = (pre) => {
    pre.inject(defaultValueCtx)
        .inject(editorStateCtx)
        .inject(editorStateOptionsCtx)
        .inject(editorStateTimerCtx, [ParserReady, SerializerReady, CommandsReady])
        .record(EditorStateReady);

    return async (ctx) => {
        await ctx.waitTimers(editorStateTimerCtx);

        const schema = ctx.get(schemaCtx);
        const parser = ctx.get(parserCtx);
        const rules = ctx.get(inputRulesCtx);
        const optionsOverride = ctx.get(editorStateOptionsCtx);
        const prosePlugins = ctx.get(prosePluginsCtx);
        const defaultValue = ctx.get(defaultValueCtx);
        const doc = getDoc(defaultValue, parser, schema);

        const plugins = [
            ...prosePlugins,
            new Plugin({
                key,
                state: {
                    init: () => {
                        // do nothing
                    },
                    apply: (_tr, _value, _oldState, newState) => {
                        ctx.set(editorStateCtx, newState);
                    },
                },
            }),
            createInputRules({ rules }),
            createKeymap(baseKeymap),
        ];

        ctx.set(prosePluginsCtx, plugins);

        const options = optionsOverride({
            schema,
            doc,
            plugins,
        });

        const state = EditorState.create(options);
        ctx.set(editorStateCtx, state);
        ctx.done(EditorStateReady);
    };
};
