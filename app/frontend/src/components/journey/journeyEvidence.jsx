import React, { useState } from "react";
import {
  COLLAPSIBLE_EVIDENCE_TOPICS,
  REDIRECT_TOPICS,
  TOPIC_FORM_FIELDS,
  TOPICS_REQUIRING_TITLES,
  getItemBody,
  getItemTitle,
  getSubdomainQuestion,
  hasText
} from "./journeyModel";

export function TopicEvidencePanel({ dimension, activeTopic, setActiveTopic, items, promptConfig, onNavigate, onAddItem, onEditItem }) {
  const activeTopicConfig = dimension.topics.find((topic) => topic.label === activeTopic) || dimension.topics[0];
  const subdomainQuestion = getSubdomainQuestion(promptConfig, activeTopicConfig);
  const redirect = REDIRECT_TOPICS[activeTopicConfig.id];

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">My Story</p>
          <h3 className="mt-1 text-xl font-semibold text-slate-950">{activeTopicConfig.label} Inputs</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">{subdomainQuestion}</p>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1">
            {dimension.topics.map((topic) => (
              <button
                key={topic.id}
                type="button"
                onClick={() => setActiveTopic(topic.label)}
                className={`rounded-md px-3 py-2 text-xs font-semibold transition ${
                  activeTopicConfig.id === topic.id ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-white"
                }`}
              >
                {topic.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => onAddItem(activeTopicConfig)}
            className="rounded-md bg-slate-950 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
          >
            {redirect?.label || `Add ${activeTopicConfig.label}`}
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-sm leading-6 text-slate-600">
            No {activeTopic.toLowerCase()} evidence has been captured yet. Alfred can still guide the trial,
            but Journey feedback becomes more useful as your examples get more concrete.
          </div>
        ) : (
          items.slice(0, 5).map((item) => (
            <EvidenceItem
              key={item.id}
              item={item}
              collapsible={COLLAPSIBLE_EVIDENCE_TOPICS.has(activeTopicConfig.id)}
              onClick={() => {
                if (redirect && onNavigate) {
                  onNavigate(redirect.page);
                  return;
                }
                onEditItem(activeTopicConfig, item);
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}

function EvidenceItem({ item, collapsible, onClick }) {
  const [expanded, setExpanded] = useState(false);
  const title = getItemTitle(item);
  const body = getItemBody(item);
  const shouldCollapse = collapsible && body && body.trim().length > 120;

  return (
    <article
      className="cursor-pointer rounded-lg border border-slate-200 bg-slate-50 p-4 transition hover:border-slate-300 hover:bg-white hover:shadow-sm"
      onClick={onClick}
    >
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      {body && (
        <p
          className="mt-2 text-sm leading-6 text-slate-600"
          style={shouldCollapse && !expanded ? {
            display: "-webkit-box",
            WebkitLineClamp: 1,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          } : undefined}
        >
          {body}
        </p>
      )}
      {shouldCollapse && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setExpanded((current) => !current);
          }}
          className="mt-2 text-xs font-semibold text-slate-700 underline-offset-2 hover:underline"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </article>
  );
}

export function SubdomainItemModal({ topic, item, promptConfig, values = [], saving, onClose, onSave, onDelete }) {
  const fields = TOPIC_FORM_FIELDS[topic.label] || [];
  const [formData, setFormData] = useState(() => fields.reduce((data, field) => {
    if (data[field.name] === undefined && field.defaultValue !== undefined) {
      data[field.name] = field.defaultValue;
    }
    return data;
  }, { ...(item || {}), value_ids: Array.isArray(item?.value_ids) ? item.value_ids : [] }));
  const isVisionTopic = topic?.id === "vision";
  const titleField = TOPICS_REQUIRING_TITLES.has(topic.id)
    ? fields.find((field) => field.name === "title")
    : null;
  const primaryField = fields.find((field) => field.required && field.type !== "hidden") ||
    fields.find((field) => field.type === "textarea") ||
    fields.find((field) => field.type !== "hidden");
  const subdomainQuestion = getSubdomainQuestion(promptConfig, topic);

  const handleChange = (fieldName, value) => {
    setFormData((current) => ({ ...current, [fieldName]: value }));
  };

  const toggleValue = (valueId) => {
    setFormData((current) => {
      const currentIds = current.value_ids || [];
      const nextIds = currentIds.includes(valueId)
        ? currentIds.filter((id) => id !== valueId)
        : [...currentIds, valueId];
      return { ...current, value_ids: nextIds };
    });
  };

  const handleSubmit = () => {
    if (titleField && !hasText(formData.title)) {
      alert("Please add a short title.");
      return;
    }

    if (primaryField?.required && !String(formData[primaryField.name] || "").trim()) {
      alert("Please answer the question before saving.");
      return;
    }

    const payload = fields.reduce((data, field) => {
      const value = formData[field.name];
      if (value !== undefined) data[field.name] = value;
      return data;
    }, {});

    if (isVisionTopic) {
      payload.value_ids = formData.value_ids || [];
    }

    onSave(payload);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      <div className="w-full max-w-2xl overflow-hidden rounded-lg bg-white shadow-2xl">
        <div className="border-b border-slate-200 px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Journey Subdomain
              </p>
              <h3 className="mt-1 text-xl font-semibold text-slate-950">
                {item?.id ? "Edit" : "Add"} {topic.label}
              </h3>
              {subdomainQuestion && <p className="mt-2 text-sm leading-6 text-slate-600">{subdomainQuestion}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-2 py-1 text-xl leading-none text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              aria-label="Close subdomain item"
            >
              x
            </button>
          </div>
        </div>

        <div className="max-h-[65vh] overflow-y-auto px-6 py-5">
          {titleField && (
            <label className="mb-4 block">
              <span className="text-sm font-semibold text-slate-800">Title</span>
              <input
                type="text"
                value={formData.title || ""}
                maxLength={20}
                onChange={(event) => handleChange("title", event.target.value.slice(0, 20))}
                className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-700 focus:ring-2 focus:ring-slate-200"
              />
              <p className="mt-1 text-xs text-slate-500">{String(formData.title || "").length}/20</p>
            </label>
          )}
          {primaryField && (
            <label className="block">
              <span className="text-sm font-semibold text-slate-800">Your answer</span>
              <textarea
                value={formData[primaryField.name] || ""}
                onChange={(event) => handleChange(primaryField.name, event.target.value)}
                rows={8}
                className="mt-2 w-full resize-y rounded-lg border border-slate-300 px-4 py-3 text-sm leading-6 outline-none focus:border-slate-700 focus:ring-2 focus:ring-slate-200"
              />
            </label>
          )}
          {isVisionTopic && (
            <div className="mt-5">
              <span className="text-sm font-semibold text-slate-800">Associated Values</span>
              {values.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {values.map((value) => {
                    const selected = (formData.value_ids || []).includes(value.id);
                    return (
                      <button
                        key={value.id}
                        type="button"
                        onClick={() => toggleValue(value.id)}
                        className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                          selected
                            ? "border-blue-500 bg-blue-50 text-blue-700"
                            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                        }`}
                      >
                        {value.title || value.value_text}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-500">Add values first, then link them to this vision.</p>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4 sm:flex-row sm:justify-end">
          {item?.id && (
            <button
              type="button"
              disabled={saving}
              onClick={onDelete}
              className="rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Delete
            </button>
          )}
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleSubmit}
            className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {item?.id ? "Save Changes" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function StatusPill({ status, detail }) {
  const styles = {
    Passed: "border-green-200 bg-green-50 text-green-700",
    Submitted: "border-blue-200 bg-blue-50 text-blue-700",
    "Needs Revision": "border-amber-200 bg-amber-50 text-amber-800",
    "Needs Deeper Reflection": "border-amber-200 bg-amber-50 text-amber-800",
    "In Progress": "border-amber-200 bg-amber-50 text-amber-700",
    "Needs Evidence": "border-slate-200 bg-slate-100 text-slate-700",
    "Not Started": "border-slate-200 bg-white text-slate-500",
  };

  return (
    <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${styles[status] || styles["Not Started"]}`}>
      {detail ? `${status} ${detail}` : status}
    </span>
  );
}
