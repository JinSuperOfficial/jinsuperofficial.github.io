import os
import json
import time
import requests

# ==================== 配置区 ====================
# 你的作业数据源 URL
HOMEWORK_URL = "https://jinsuperofficial.github.io/811/data/homework.json"
# ================================================

# 从 GitHub Secrets 中读取敏感配置
APPID = os.environ.get("WX_APPID")
SECRET = os.environ.get("WX_SECRET")
TEMPLATE_ID = os.environ.get("WX_TEMPLATE_ID")

def fetch_homework_from_web():
    """从远程 JSON 文件获取作业数据"""
    print(f"正在拉取作业数据: {HOMEWORK_URL}")
    try:
        res = requests.get(HOMEWORK_URL, timeout=10)
        res.raise_for_status()
        homework_data = res.json()
        
        # 提取标题
        title = homework_data.get("title", "今日作业")
        
        # 拼接各科作业内容
        content_parts = []
        subjects = ["语文", "数学", "英语", "科学", "社会", "笔记"]
        
        for subject in subjects:
            if subject in homework_data and homework_data[subject]:
                # 替换原有的 \n 为换行符，并加上科目标题
                subject_content = homework_data[subject].replace("\\n", "\n")
                content_parts.append(f"【{subject}】\n{subject_content}")
        
        # 用两个换行符拼接各科内容
        full_content = "\n\n".join(content_parts)
        
        # 防止内容超长导致微信接口报错 (微信限制约2048字节，这里保守截取前 600 个字符)
        # 如果不够600字，就全发；如果超过600字，截断并加上省略号
        if len(full_content) > 600:
            full_content = full_content[:600] + "\n\n... (内容过长，完整版请在网页查看)"
            
        return title, full_content
        
    except Exception as e:
        print(f"❌ 获取作业数据失败: {e}")
        return None, None

def main():
    # 1. 检查环境变量
    if not all([APPID, SECRET, TEMPLATE_ID]):
        print("❌ 环境变量缺失，请检查 GitHub Secrets 配置。")
        return

    # 2. 读取 students.json
    try:
        base_dir = os.path.dirname(os.path.abspath(__file__))
        json_path = os.path.join(base_dir, "students.json")
        
        with open(json_path, "r", encoding="utf-8") as f:
            students = json.load(f)
            
        if not students:
            print("❌ students.json 为空，没有需要推送的同学。")
            return
            
        print(f"✅ 成功读取名单，共 {len(students)} 位同学。")
    except Exception as e:
        print(f"❌ 读取 students.json 失败: {e}")
        return

    # 3. 获取当天的作业数据
    title, content = fetch_homework_from_web()
    if not title or not content:
        return  # 获取作业失败，直接停止运行

    print(f"📌 获取到的作业标题: {title}")
    print(f"📌 准备推送的内容摘要: \n{content[:100]}...")

    # 4. 获取 access_token
    print("正在获取 access_token...")
    token_url = f"https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid={APPID}&secret={SECRET}"
    token_res = requests.get(token_url).json()
    access_token = token_res.get("access_token")
    
    if not access_token:
        print("❌ 获取 access_token 失败:", token_res)
        return
    print("✅ access_token 获取成功。")

    # 5. 遍历同学名单，逐个推送
    send_url = f"https://api.weixin.qq.com/cgi-bin/message/template/send?access_token={access_token}"
    
    for index, student in enumerate(students):
        name = student.get("name", "未知")
        userid = student.get("userid")
        
        if not userid:
            print(f"⚠️ 跳过第 {index+1} 位同学：未配置 userid")
            continue

        data = {
            "touser": userid,
            "template_id": TEMPLATE_ID,
            "data": {
                "title": {"value": title},
                "content": {"value": content}
            }
        }
        
        res = requests.post(send_url, json=data).json()
        
        if res.get("errcode") == 0:
            print(f"✅ [{index+1}/{len(students)}] 推送给 {name} 成功")
        else:
            print(f"❌ [{index+1}/{len(students)}] 推送给 {name} 失败: {res}")
        
        # 每次发送间隔 1.5 秒
        time.sleep(1.5)

if __name__ == "__main__":
    main()
