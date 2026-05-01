from __future__ import annotations

import csv
import json
from datetime import UTC, datetime
from collections import defaultdict
from io import BytesIO, StringIO
from typing import Iterable
from uuid import uuid4

from reportlab.graphics.shapes import Drawing, Line, Rect, String
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.entities import GeneratedReport, ProcessingJob, ReportType, ToolTimeline
from app.services.storage import get_storage_service

REPORT_BLUE = colors.HexColor("#1A56A0")
REPORT_ALT_ROW = colors.HexColor("#EBF2FC")
REPORT_TEXT = colors.HexColor("#0F172A")
REPORT_MUTED = colors.HexColor("#6B7280")
GANTT_BACKGROUND = colors.HexColor("#1A1A2E")
GANTT_GRID = colors.HexColor("#333355")

TOOL_COLORS: dict[str, colors.Color] = {
    "grasper": colors.HexColor("#2ECC71"),
    "l-hook": colors.HexColor("#3498DB"),
    "l-hook electrocautery": colors.HexColor("#3498DB"),
    "bipolar": colors.HexColor("#9B59B6"),
    "scissors": colors.HexColor("#F39C12"),
    "irrigator": colors.HexColor("#1ABC9C"),
}
TOOL_FALLBACK_PALETTE = [
    colors.HexColor("#16A34A"),
    colors.HexColor("#2563EB"),
    colors.HexColor("#EA580C"),
    colors.HexColor("#7C3AED"),
    colors.HexColor("#0891B2"),
    colors.HexColor("#BE185D"),
    colors.HexColor("#0EA5E9"),
]


def _timeline_as_dicts(timeline_rows: Iterable[ToolTimeline]) -> list[dict[str, float | int | str]]:
    return [
        {
            "track_id": row.track_id,
            "tool": row.tool_name,
            "class_id": row.class_id,
            "start_sec": row.start_sec,
            "end_sec": row.end_sec,
            "duration_sec": row.duration_sec,
            "mean_conf": row.mean_conf,
            "frame_count": row.frame_count,
        }
        for row in timeline_rows
    ]


def _build_csv_bytes(rows: list[dict[str, float | int | str]]) -> bytes:
    output = StringIO()
    if rows:
        writer = csv.DictWriter(output, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
    else:
        output.write("track_id,tool,class_id,start_sec,end_sec,duration_sec,mean_conf,frame_count\n")
    return output.getvalue().encode("utf-8")


def _format_time(seconds: float) -> str:
    clamped = max(float(seconds), 0.0)
    hours = int(clamped // 3600)
    minutes = int((clamped % 3600) // 60)
    secs = clamped % 60
    if hours > 0:
        return f"{hours:02d}:{minutes:02d}:{secs:04.1f}"
    return f"{minutes:02d}:{secs:04.1f}"


def _color_for_tool(tool_name: str) -> colors.Color:
    key = tool_name.strip().lower()
    if key in TOOL_COLORS:
        return TOOL_COLORS[key]
    fallback = TOOL_FALLBACK_PALETTE[sum(ord(ch) for ch in key) % len(TOOL_FALLBACK_PALETTE)]
    return fallback


def _instrument_summary(rows: list[dict[str, float | int | str]], *, total_video_sec: float) -> list[dict[str, float | int | str]]:
    grouped: dict[str, dict[str, float]] = defaultdict(
        lambda: {
            "appearances": 0,
            "total_time_sec": 0.0,
            "mean_conf_sum": 0.0,
            "longest_sec": 0.0,
        }
    )
    for row in rows:
        tool = str(row["tool"])
        duration = max(float(row["duration_sec"]), 0.0)
        mean_conf = max(float(row["mean_conf"]), 0.0)
        grouped[tool]["appearances"] += 1
        grouped[tool]["total_time_sec"] += duration
        grouped[tool]["mean_conf_sum"] += mean_conf
        grouped[tool]["longest_sec"] = max(grouped[tool]["longest_sec"], duration)

    summary_rows: list[dict[str, float | int | str]] = []
    for tool_name, stats in grouped.items():
        appearances = int(stats["appearances"])
        total_time = float(stats["total_time_sec"])
        summary_rows.append(
            {
                "tool": tool_name,
                "appearances": appearances,
                "total_time_sec": round(total_time, 2),
                "mean_confidence": round(float(stats["mean_conf_sum"]) / max(appearances, 1), 3),
                "longest_sec": round(float(stats["longest_sec"]), 2),
                "pct_of_video": round((total_time / total_video_sec * 100.0) if total_video_sec > 0 else 0.0, 1),
            }
        )

    summary_rows.sort(key=lambda row: float(row["total_time_sec"]), reverse=True)
    return summary_rows


def _build_section_header(title: str, *, width: float, style: ParagraphStyle) -> list:
    line = Drawing(width, 2)
    line.add(Line(0, 1, width, 1, strokeColor=REPORT_BLUE, strokeWidth=1))
    return [Paragraph(title, style), line, Spacer(1, 4)]


def _build_timeline_drawing(rows: list[dict[str, float | int | str]], *, width: float, height: float) -> Drawing | None:
    if not rows:
        return None

    ordered_rows = sorted(rows, key=lambda row: (float(row["start_sec"]), float(row["end_sec"]), int(row["track_id"])))
    tool_first_start: dict[str, float] = {}
    for row in ordered_rows:
        tool_name = str(row["tool"])
        tool_first_start.setdefault(tool_name, float(row["start_sec"]))

    tool_names = sorted(tool_first_start.keys(), key=lambda tool: tool_first_start[tool])
    tool_index = {tool_name: index for index, tool_name in enumerate(tool_names)}

    total_video_sec = max(float(row["end_sec"]) for row in ordered_rows)
    if total_video_sec <= 0:
        total_video_sec = max(float(row["duration_sec"]) for row in ordered_rows)
    total_video_sec = max(total_video_sec, 1.0)

    chart_width = float(width)
    chart_height = float(height)
    left_margin = 88.0
    right_margin = 16.0
    top_margin = 18.0
    bottom_margin = 28.0
    plot_width = max(chart_width - left_margin - right_margin, 50.0)
    plot_height = max(chart_height - top_margin - bottom_margin, 40.0)
    lane_height = plot_height / max(len(tool_names), 1)
    bar_height = max(min(lane_height * 0.58, 12.0), 4.0)

    drawing = Drawing(chart_width, chart_height)
    drawing.add(Rect(left_margin, bottom_margin, plot_width, plot_height, fillColor=GANTT_BACKGROUND, strokeColor=GANTT_GRID, strokeWidth=0.8))
    drawing.add(String(left_margin, chart_height - 10, "Surgical Instrument Timeline (Gantt)", fontName="Helvetica-Bold", fontSize=8, fillColor=REPORT_TEXT))

    tick_count = 6
    for tick in range(tick_count + 1):
        ratio = tick / tick_count
        x = left_margin + ratio * plot_width
        drawing.add(Line(x, bottom_margin, x, bottom_margin + plot_height, strokeColor=colors.HexColor("#2A2F45"), strokeWidth=0.6))
        drawing.add(
            String(
                x,
                bottom_margin - 11,
                _format_time(total_video_sec * ratio),
                fontName="Helvetica",
                fontSize=7,
                fillColor=REPORT_MUTED,
                textAnchor="middle",
            )
        )

    for lane in range(len(tool_names) + 1):
        y = bottom_margin + lane * lane_height
        drawing.add(Line(left_margin, y, left_margin + plot_width, y, strokeColor=colors.HexColor("#2A2F45"), strokeWidth=0.4))

    for tool_name, lane in tool_index.items():
        lane_center = bottom_margin + plot_height - (lane + 0.5) * lane_height
        drawing.add(String(4, lane_center - 3, tool_name, fontName="Helvetica", fontSize=7.5, fillColor=REPORT_TEXT))

    for row in ordered_rows:
        tool_name = str(row["tool"])
        lane = tool_index[tool_name]
        start_sec = max(float(row["start_sec"]), 0.0)
        duration_sec = max(float(row["duration_sec"]), 0.0)
        confidence = max(float(row["mean_conf"]), 0.0)

        x = left_margin + (start_sec / total_video_sec) * plot_width
        width_px = max((duration_sec / total_video_sec) * plot_width, 1.5)
        lane_top = bottom_margin + plot_height - lane * lane_height
        y = lane_top - (lane_height + bar_height) / 2

        base_color = _color_for_tool(tool_name)
        fill_color = colors.Color(base_color.red, base_color.green, base_color.blue, alpha=min(1.0, 0.45 + confidence * 0.5))
        drawing.add(Rect(x, y, width_px, bar_height, fillColor=fill_color, strokeColor=None))

    drawing.add(
        String(
            left_margin + plot_width / 2,
            5,
            "Time (MM:SS.s)",
            fontName="Helvetica",
            fontSize=7,
            fillColor=REPORT_MUTED,
            textAnchor="middle",
        )
    )
    return drawing


def _build_pdf_bytes(case_code: str, rows: list[dict[str, float | int | str]], *, procedure_type: str | None = None) -> bytes:
    ordered_rows = sorted(rows, key=lambda row: (float(row["start_sec"]), float(row["end_sec"]), int(row["track_id"])))
    total_video_sec = max((float(row["end_sec"]) for row in ordered_rows), default=0.0)
    summary_rows = _instrument_summary(ordered_rows, total_video_sec=total_video_sec)

    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title="Surgical Intelligence Report",
    )
    content_width = 170 * mm

    base_styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "ReportTitle",
        parent=base_styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=18,
        textColor=REPORT_BLUE,
        spaceAfter=2,
    )
    subtitle_style = ParagraphStyle(
        "ReportSubtitle",
        parent=base_styles["BodyText"],
        fontName="Helvetica",
        fontSize=9,
        textColor=REPORT_MUTED,
        leading=12,
    )
    body_style = ParagraphStyle(
        "ReportBody",
        parent=base_styles["BodyText"],
        fontName="Helvetica",
        fontSize=10,
        textColor=REPORT_TEXT,
        leading=13,
    )
    section_style = ParagraphStyle(
        "ReportSection",
        parent=base_styles["Heading3"],
        fontName="Helvetica-Bold",
        fontSize=12,
        textColor=REPORT_BLUE,
        spaceBefore=4,
        spaceAfter=2,
    )

    generated_at = datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC")
    story: list = [
        Paragraph("Surgical Intelligence Report", title_style),
        Paragraph(f"Case: {case_code} | Generated: {generated_at}", subtitle_style),
        Paragraph("For decision-support and training use only; not a final diagnosis.", subtitle_style),
        Spacer(1, 8),
    ]

    story.extend(_build_section_header("1. Procedure Summary", width=content_width, style=section_style))
    summary_table_data = [
        ["Procedure type", procedure_type or "Not specified"],
        ["Video duration", _format_time(total_video_sec)],
        ["Instruments tracked", str(len({str(row['tool']) for row in ordered_rows}))],
        ["Total appearances", str(len(ordered_rows))],
    ]
    summary_table = Table(summary_table_data, colWidths=[52 * mm, 118 * mm], hAlign="LEFT")
    summary_table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("TEXTCOLOR", (0, 0), (-1, -1), REPORT_TEXT),
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#F8FAFC")),
                ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#D1D5DB")),
                ("INNERGRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#E5E7EB")),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story.extend([summary_table, Spacer(1, 8)])

    story.extend(_build_section_header("2. Instrument Statistics", width=content_width, style=section_style))
    stats_header = ["Instrument", "Total Time", "% of Video", "Appearances", "Mean Conf"]
    stats_data = [stats_header]
    for row in summary_rows:
        stats_data.append(
            [
                str(row["tool"]),
                _format_time(float(row["total_time_sec"])),
                f"{float(row['pct_of_video']):.1f}%",
                str(int(row["appearances"])),
                f"{float(row['mean_confidence']):.3f}",
            ]
        )
    if not summary_rows:
        stats_data.append(["No instrument rows available", "-", "-", "-", "-"])

    stats_table = Table(stats_data, colWidths=[58 * mm, 30 * mm, 26 * mm, 28 * mm, 28 * mm], repeatRows=1, hAlign="LEFT")
    stats_style = TableStyle(
        [
            ("BACKGROUND", (0, 0), (-1, 0), REPORT_BLUE),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 10),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
            ("FONTSIZE", (0, 1), (-1, -1), 9),
            ("TEXTCOLOR", (0, 1), (-1, -1), REPORT_TEXT),
            ("BOX", (0, 0), (-1, -1), 0.7, colors.HexColor("#CBD5E1")),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]
    )
    for row_index in range(1, len(stats_data)):
        stats_style.add("BACKGROUND", (0, row_index), (-1, row_index), REPORT_ALT_ROW if row_index % 2 == 1 else colors.white)
    stats_table.setStyle(stats_style)
    story.extend([stats_table, Spacer(1, 8)])

    story.extend(_build_section_header("3. Instrument Timeline", width=content_width, style=section_style))
    timeline_drawing = _build_timeline_drawing(ordered_rows, width=float(content_width), height=float(82 * mm))
    if timeline_drawing is None:
        story.append(Paragraph("No timeline rows available for chart generation.", body_style))
    else:
        story.append(timeline_drawing)

    story.extend([Spacer(1, 8), PageBreak()])
    story.extend(_build_section_header("4. Detailed Appearance Log", width=content_width, style=section_style))

    log_header = ["Tool", "Track ID", "Start", "End", "Duration", "Confidence"]
    log_data = [log_header]
    for row in ordered_rows:
        log_data.append(
            [
                str(row["tool"]),
                f"#{int(row['track_id'])}",
                _format_time(float(row["start_sec"])),
                _format_time(float(row["end_sec"])),
                f"{float(row['duration_sec']):.1f}s",
                f"{float(row['mean_conf']):.3f}",
            ]
        )
    if not ordered_rows:
        log_data.append(["No timeline rows available", "-", "-", "-", "-", "-"])

    log_table = Table(log_data, colWidths=[38 * mm, 22 * mm, 26 * mm, 26 * mm, 26 * mm, 32 * mm], repeatRows=1, hAlign="LEFT")
    log_style = TableStyle(
        [
            ("BACKGROUND", (0, 0), (-1, 0), REPORT_BLUE),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 9),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
            ("FONTSIZE", (0, 1), (-1, -1), 8.5),
            ("TEXTCOLOR", (0, 1), (-1, -1), REPORT_TEXT),
            ("BOX", (0, 0), (-1, -1), 0.7, colors.HexColor("#CBD5E1")),
            ("INNERGRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#E2E8F0")),
            ("TOPPADDING", (0, 0), (-1, -1), 3.5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
        ]
    )
    for row_index in range(1, len(log_data)):
        log_style.add("BACKGROUND", (0, row_index), (-1, row_index), REPORT_ALT_ROW if row_index % 2 == 1 else colors.white)
    log_table.setStyle(log_style)
    story.append(log_table)

    doc.build(story)
    buffer.seek(0)
    return buffer.read()


def generate_reports_for_job(
    db: Session,
    *,
    job: ProcessingJob,
    report_types: list[ReportType] | None = None,
) -> list[GeneratedReport]:
    if report_types is None:
        report_types = [ReportType.json, ReportType.csv, ReportType.pdf]

    timeline_rows = db.scalars(select(ToolTimeline).where(ToolTimeline.job_id == job.id).order_by(ToolTimeline.start_sec)).all()
    timeline_dicts = _timeline_as_dicts(timeline_rows)
    storage = get_storage_service()

    created_rows: list[GeneratedReport] = []
    for report_type in report_types:
        ext = report_type.value
        storage_key = f"reports/{job.case_id}/{job.id}/{uuid4()}/timeline.{ext}"

        if report_type == ReportType.json:
            payload = json.dumps(timeline_dicts, indent=2).encode("utf-8")
            mime = "application/json"
        elif report_type == ReportType.csv:
            payload = _build_csv_bytes(timeline_dicts)
            mime = "text/csv"
        elif report_type == ReportType.pdf:
            case_code = job.case.case_code if job.case is not None else job.case_id
            procedure_type = job.case.procedure_type if job.case is not None else None
            payload = _build_pdf_bytes(case_code=case_code, rows=timeline_dicts, procedure_type=procedure_type)
            mime = "application/pdf"
        else:
            raise ValueError(f"Unsupported report type for generation: {report_type}")

        storage.upload_bytes(storage_key=storage_key, content=payload, content_type=mime)
        report_row = GeneratedReport(
            case_id=job.case_id,
            job_id=job.id,
            report_type=report_type,
            storage_key=storage_key,
            size_bytes=len(payload),
        )
        db.add(report_row)
        created_rows.append(report_row)

    db.commit()
    for row in created_rows:
        db.refresh(row)
    return created_rows

